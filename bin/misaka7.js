var async = require('async');
var fs = require('fs');
var i18n = require('i18n');
var minimist = require('minimist');
var path = require('path');
var _ = require('underscore');
var Config = require(path.join(__dirname, '..', 'lib', 'config')).Config;
var DbManager = require(path.join(__dirname, '..', 'lib', 'db_manager'));
var Picarto = require(path.join(__dirname, '..', 'lib', 'picarto'));
var Bot = require(path.join(__dirname, '..', 'lib', 'bot'));
var CommandProcessor = require(path.join(__dirname, '..', 'lib', 'command_processor'));
var Locale = require(path.join(__dirname, '..', 'lib', 'locale'));
var MessageQueue = require(path.join(__dirname, '..', 'lib', 'message_queue'));
var ModuleHelper = require(path.join(__dirname, '..', 'lib', 'module_helper'));
var ModuleManager = require(path.join(__dirname, '..', 'lib', 'module_manager'));
var SocketInterface = require(path.join(__dirname, '..', 'lib', 'interfaces', 'socket_interface'));
var logger = require(path.join(__dirname, '..', 'lib', 'logger'));
var __ = i18n.__;

var Misaka = function() {
  this.initArgs();

  // XOXOXO
  global.misaka = this; 
  global.misaka._onMessageReceived = [];
  global.misaka._onMessageReceived = [];
  // XOXOXO

  if(this.argv.help) {
    this.printHelp();
    process.exit();
  }

  this.initLocale();
  this.initLoggerLevel();

  // Try to initialize config
  if(!this.initConfig()) {
    logger.error('Couldn\'t read config file, aborting');
    process.exit(1);
  } else {
    logger.log('debug', 'Loaded config', { path: this.argv.config });
  }

  this.initLogger();
  this.initDbManager();
  this.initInterface();

  // For now, commands just an object: name -> module with onCommand
  this.helper = new ModuleHelper();
  this.cmdproc = new CommandProcessor();
  this.modules = new ModuleManager({}, 7);
  this.initModules();

  // Message queues for rooms
  this.queues = {};

  // argv overrides config
  if(this.argv.room) this.config.setRoom(this.argv.room);

  if(this.config.getRooms().length === 0) {
    logger.error('No room to join specified, aborting');
    process.exit(1);
  }

  this.initBot();
};

Misaka.prototype.initArgs = function() {
  var argv = this.argv = minimist(process.argv.slice(2));

  if(argv.h) argv.help = true;
  if(argv.r) argv.room = argv.r;
  if(argv.c) argv.config = argv.c;

  if(_.isUndefined(argv.config)) {
    argv.config = Config.getDefaultPath('misaka7');
  }
};

/**
 * Initialize the bot.
 */
Misaka.prototype.initBot = function() {
  var misaka = this,
      bot = this.bot = new Bot({
    username: this.config.getUsername(),
    password: this.config.getPassword(),
    color: this.config.getColor(),
    room: this.config.getRooms()[0],
    unescape: true
  });

  bot.connect(function(error, client) {
    if(!error) {
      misaka.setupEvents(client);
    } else {
      logger.error(error, { msg: 'Error connecting to room', room: misaka.getConfig().getRooms()[0] });
      process.exit(1);
    }
  });
};

/**
 * Setup events for a client.
 * @param client Client
 */
Misaka.prototype.setupEvents = function(client) {
  var misaka = this,
      socket = client.getSocket(),
      roomname = misaka.config.getRooms()[0];

  this.initMessageQueue(client);
  // Consider room joined
  this.fireRoomJoin(roomname); // XUXUXU

  console.log(__('Connected'));

  socket.on('disconnect', function() {
    console.log(__('Disconnected'));
  });

  socket.on('meMsg', function(data) {
    misaka.print('** ' + data.username + ' ' + data.msg + ' **');
  });

  socket.on('whisper', function(data) {
    misaka.print(data.username + ' whispered: ' + data.msg);
  });

  socket.on('userMsg', function(data) {
    if(!data.history) {
      var username = data.username,
          message = data.msg;

  // XOXOXO
      for (var i = 0; i < global.misaka._onMessageReceived.length; ++i)
        global.misaka._onMessageReceived[i](data);
  // XOXOXO
      misaka.print(username + ': ' + message);

      var db = misaka.getDbManager();

      db.insertMessageToLog(roomname, username, message, function(err) {
        if(err) {
          logger.error(err, { msg: 'Error logging message' });
        }
      });

      // Check if command
      if(misaka.cmdproc.isCommand(username, message)
          && username.toLowerCase() != misaka.getConfig().getUsername().toLowerCase()) {
        misaka.processCommand(data);
      }
    }
  });

  socket.on('clearChat', function() {
    misaka.print('*** ' + __('Room chat has been cleared by admin') + ' ***');
  });

  client.on('history', function(history) {
    console.log('--- ' + __('Begin History') + ' ---');
    history.forEach(function(data) {
      console.log(data.username + ': ' + data.msg);
    });
    console.log('--- ' + __('End History') + ' ---');
  });

  var onlineWatcher = client.getOnlineWatcher();

  onlineWatcher.on('stateChanged', function(online) {
    if(online) {
      misaka.send(__('%s is now online!', roomname));
    } else {
      misaka.send(__('%s is now offline.', roomname));
    }
  });

  // Setup userlist events
  var userList = client.getUserList();

  userList.on('initial', function(users) {
    var usernames = [];
    users.forEach(function(user) {
      usernames.push(user.username);
    });
    console.log(__('Users in room: %s', usernames.join(', ')));
  });

  userList.on('userAdded', function(user) {
    // XOXOXO
    misaka.print('*** ' + __('%s has joined the room', user.username) + ' ***');
  });

  userList.on('userChanged', function(diff) {
    misaka.print('*** ' + __('%s has changed in some way', diff[0].username) + ' ***');
  });

  userList.on('userRemoved', function(user) {
    misaka.print('*** ' + __('%s has left the room', user.username) + ' ***');
  });
};

/**
 * Process a command message given a message object.
 * @param data Message object received from userMsg event.
 */
Misaka.prototype.processCommand = function(data) {
  var misaka = this,
      username = data.username,
      message = data.msg,
      cmdname = misaka.cmdproc.getCommandName(message),
      command = misaka.getCommand(cmdname),
      roomname = this.config.getRooms()[0];

  if(command && command.isEnabled() && command.isMasterOnly()
    && username !== misaka.getMasterName()) {
    logger.warn('Non-master trying to use a master-only command', { username: username, command: command.name() });
  } else if(command && !command.canBeUsed(username)) {
    logger.warn('Cooldown prevented command execution', { username: username, command: command.name() });
  } else if(command && command.isEnabled()) {
    command.used(username);

    result = command.execute({
      database: this.getDbManager(),
      helper: misaka.helper, // Module helper
      logger: logger,
      message: message, // Full message
      parent: misaka,
      parsed: misaka.helper.parseCommandMessage(message),
      room: { name: roomname }, // Backwards compatibility for modules
      roomname: roomname,
      send: Misaka.prototype.send.bind(misaka, roomname),
      sender: username
    });

    // If a result was returned, assume it's a message, enqueue
    if(result !== undefined) {
      misaka.send(roomname, result);
    }
  } else if(!command) {
    misaka.print(__('No command found: %s', cmdname));
  } else if(!command.isEnabled()) {
    misaka.print(__('Command (or parent module) is disabled: %s', cmdname));
  }
};

/**
 * Initialize the config file at the default path
 * (config/misaka.json)
 * @return true on success, false on error loading config
 */
Misaka.prototype.initConfig = function() {
  this.config = new Config();
  this.config.createDirectorySync();

  var success = false;
  try {
    success = this.config.readSync(this.argv.config);
  } catch (e) {
    logger.error(e, 'Error reading config');
  }

  return success;
};

/**
 * Initialize the database manager.
 */
Misaka.prototype.initDbManager = function() {
  this._db = new DbManager({
    path: this.config.getDbPath()
  });
};

/**
 * Initialize the interface (for now, always the SocketInterface).
 */
Misaka.prototype.initInterface = function() {
  var send = Misaka.prototype.send.bind(this);

  this._interface = new SocketInterface();
  this._interface.on('sendMsg', function(msg) {
    send(msg);
  });
};

/**
 * Get the database manager instance.
 * @return {DbManager} Database manager instance
 */
Misaka.prototype.getDbManager = function() {
  return this._db;
};

Misaka.prototype.initModules = function() {
  this.modules.loadFromDirectory();

  // Load from lib/modules/private if it exists
  var privPath = path.join(__dirname, '..', 'lib', 'modules', 'private'),
      stat = fs.statSync(privPath);

  if(stat && stat.isDirectory()) {
    this.modules.loadFromDirectory(privPath);
  }

  logger.info(this.modules.toString());
};

/**
 * Configure the global i18n instance.
 */
Misaka.prototype.initLocale = function() {
  (new Locale()).configure();
};

/**
 * Initialize the logger level. This allows for logging after parsing argv
 * but before loading the config file.
 */
Misaka.prototype.initLoggerLevel = function() {
  if(this.argv.debug) {
    logger.setLevel('debug');
  }
};

/**
 * Initialize the singleton logger.
 */
Misaka.prototype.initLogger = function() {
  // Set logging config stuff
  if(this.config.logging) {
    if(this.config.logging.detection !== undefined) {
      logger.enableDetection(!!this.config.logging.detection);
    }
  }

  if(this.argv.debug) {
    logger.setLevel('debug');
  }
};

/**
 * Set all queues to connected or disconnected.
 * @param c Connected state, true if connected or false
 *          if disconnected
 */
Misaka.prototype.setConnected = function(c) {
  for(var key in this.queues) {
    var queue = this.queues[key];
    if(queue) {
      queue.setConnected(c);
    }
  }
};

/**
 * Send a message, which really just pushes the message to
 * the room's message queue.
 * @param roomname Name of room to send message to
 * @param message Message to send
 */
Misaka.prototype.send = function(roomname, message) {
  // If only one arg, assume message and use the default room name
  if(arguments.length === 1) {
    message = roomname;
    roomname = this.config.getRooms()[0];
  }

  var queue = this.queues[roomname];
  if(queue) {
    queue.push(message);
  } else {
    logger.warn('Cannot push message to non-existant queue', { room: roomname });
  }
};

/**
 * Initialize the message queue for a given room.
 * @param client Client the message queue is for
 */
Misaka.prototype.initMessageQueue = function(client) {
  var queue = new MessageQueue({
    send: Picarto.ClientV7.prototype.sendMessage.bind(client),
    wait: 1000
  });

  var roomname = this.config.getRooms()[0];
  this.queues[roomname] = queue;
};

/**
 * Get the bot instance.
 * @return bot instance
 */
Misaka.prototype.getBot = function() {
  return this.bot;
};

/**
 * Chat version Misaka is for.
 * @return chat version as number
 */
Misaka.prototype.getChatVersion = function() {
  return 7;
};

/**
 * Get the config object.
 * @return config object
 */
Misaka.prototype.getConfig = function() {
  return this.config;
};

/**
 * Get the master user's name if we have one.
 * @return master user's name, or undefined if none
 */
Misaka.prototype.getMasterName = function() {
  return this.config.getMaster();
};

/**
 * Get the module manager.
 * @return Module manager
 */
Misaka.prototype.getModuleManager = function() {
  return this.modules;
};

/**
 * Get a command by name.
 * @param name Command name
 * @return command instance if found, undefined if not found
 */
Misaka.prototype.getCommand = function(name) {
  return this.modules.getCommand(name.toLowerCase());
};

/**
 * Get a module by name.
 * @param name Module name
 * @return module instance if found, undefined if not found
 */
Misaka.prototype.getModule = function(name) {
  return this.modules.get(name.toLowerCase());
};

/**
 * Check if a command is enabled.
 * @param command Command instance or name as a string. If
 *        a string is given, will return false if command
 *        not found.
 * @return true if command enabled, false if not enabled
 *         (or command not found)
 */
Misaka.prototype.isCommandEnabled = function(command) {
  if(command instanceof String) {
    command = this.getCommand(command);
    if(!command) return false; // Command not found, return false
  }

  // If command has a module, check if that's enabled too
  return command.isEnabled(); // && (command.module ? command.module.enabled : true);
};

/**
 * Fire the 'join' event for all modules. Should probably move this later.
 * @param room Room name of joined room
 */
Misaka.prototype.fireRoomJoin = function(roomname) {
  var misaka = this;

  this.modules.forEach(function(module) {
    var config = misaka.config.getModuleConfig(module.name());
    if(!config) config = {};

    module.emit('join', {
      config: config,
      logger: logger,
      room: { name: roomname },
      send: Misaka.prototype.send.bind(misaka, roomname)
    });
  });
};

/**
 * Print something to console with a date string.
 * @param s String to print
 */
Misaka.prototype.print = function(s) {
  var date = (new Date()).toTimeString().split(' ')[0];
  console.log('[' + date + '] ' + s);
};

Misaka.prototype.teardown = function(callback) {
  var asyncTasks = [];

  // If interface, close it
  if(this._interface) {
    asyncTasks.push(this._interface.close.bind(this._interface));
  }

  async.parallel(asyncTasks, function() {
    // Assuming the logger hasn't been torn down
    logger.log('debug', 'Tearing down complete (async)', { count: asyncTasks.length });

    if(callback) {
      callback();
    }
  });
};

Misaka.prototype.printHelp = function() {
  console.log('Misaka - picarto.tv bot (for chat V7)');
  console.log('usage: misaka7 [options]');
  console.log('');
  console.log('options:');
  console.log('  -h, --help    print this help message');
  console.log('  -r, --room    room to join');
  console.log('  --debug       enable debug logger');
};

var misaka = new Misaka();

// Handle SIGINT and stuff
(function() {
  process.stdin.resume();
  process.on('SIGINT', function() {
    misaka.teardown(function() {
      process.exit();
    });
  });
})();
