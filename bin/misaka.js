var fs = require('fs');
var minimist = require('minimist');
var path = require('path');
var _ = require('underscore');
var Config = require(path.join(__dirname, '..', 'lib', 'config')).Config;
var DbManager = require(path.join(__dirname, '..', 'lib', 'db_manager'));
var Picarto = require(path.join(__dirname, '..', 'lib', 'picarto'));
var CommandProcessor = require(path.join(__dirname, '..', 'lib', 'command_processor'));
var MessageQueue = require(path.join(__dirname, '..', 'lib', 'message_queue'));
var ModuleHelper = require(path.join(__dirname, '..', 'lib', 'module_helper'));
var ModuleManager = require(path.join(__dirname, '..', 'lib', 'module_manager'));
var logger = require(path.join(__dirname, '..', 'lib', 'logger'));

var Misaka = function() {
  this.initArgs();

  if(this.argv.help) {
    this.printHelp();
    process.exit();
  }

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

  // For now, commands just an object: name -> module with onCommand
  this.helper = new ModuleHelper();
  this.cmdproc = new CommandProcessor();
  this.modules = new ModuleManager();
  this.initModules();

  // Message queues for rooms
  this.queues = {};

  // argv overrides config
  if(this.argv.room) this.config.setRoom(this.argv.room);

  if(this.config.getRooms().length === 0) {
    logger.error('No room to join specified, aborting');
    process.exit(1);
  }

  this.initClient();
};

Misaka.prototype.initArgs = function() {
  var argv = this.argv = minimist(process.argv.slice(2));

  if(argv.h) argv.help = true;
  if(argv.r) argv.room = argv.r;
  if(argv.c) argv.config = argv.c;

  if(_.isUndefined(argv.config)) {
    argv.config = Config.getDefaultPath('misaka');
  }
};

Misaka.prototype.initClient = function() {
  var misaka = this;

  if(this.config === undefined) {
    return new Error('Cannot initialize client without config');
  }

  this.client = new Picarto.Client({
    authkey: this.config.getAuthkey(),
    color: this.config.getColor(),
    username: this.config.getUsername(),
    password: this.config.getPassword()
  });

  // Listen for auth events
  this.client.on('auth', function(authData) {
    if(authData) { // Re-authd
      misaka.setConnected(true);
    } else { // Un-authd
      misaka.setConnected(false);
    }
  });

  // Listen for global messages
  this.client.on('message:global', function(s) {
    misaka.print('*** Global Message *** ' + s.message);
  });

  // Connect
  this.client.connect(function(err, authData) {
    if(!err) {
      // Join room
      var room = misaka.client.join(misaka.config.getRooms()[0]);
      misaka.initRoom(room);
    } else {
      logger.error(err, { msg: 'Error connecting' });
    }
  });
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
  var queue = this.queues[roomname];
  if(queue) {
    queue.push(message);
  } else {
    console.warn('Cannot push message to non-existant queue: %s', roomname);
  }
};

/**
 * Initialize the message queue for a given room.
 * @param room Room the message queue is for
 */
Misaka.prototype.initMessageQueue = function(room) {
  var queue = new MessageQueue({
    send: Picarto.Room.prototype.message.bind(room),
    wait: 1000
  });

  this.queues[room.name] = queue;
};

/**
 * Chat version Misaka is for.
 * @return chat version as number
 */
Misaka.prototype.getChatVersion = function() {
  return 6;
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
 * Fire the 'join' event for all modules. Should probably
 * move this later.
 * @param room Joined room
 */
Misaka.prototype.fireRoomJoin = function(room) {
  var misaka = this;

  this.modules.forEach(function(module) {
    var config = misaka.config.getModuleConfig(module.name());
    if(!config) config = {};

    module.emit('join', {
      config: config,
      logger: logger,
      room: room,
      send: Misaka.prototype.send.bind(misaka, room.name)
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

/**
 * Process a command message given a message object.
 * @param {Room} room Room instance
 * @param {MessageSnapshot} snapshot
 */
Misaka.prototype.processCommand = function(room, snapshot) {
  var username = snapshot.username,
      message = snapshot.message,
      cmdname = this.cmdproc.getCommandName(message);

  var command = this.getCommand(cmdname);
  if(command && command.isEnabled() && command.isMasterOnly()
    && username !== this.getMasterName()) {
    logger.warn('Non-master trying to use a master-only command', { username: username, command: command.name() });
  } else if(command && !command.canBeUsed(username)) {
    logger.warn('Cooldown prevented command execution', { username: username, command: command.name() });
  } else if(command && command.isEnabled()) {
    command.used(username);

    result = command.execute({
      database: this.getDbManager(),
      helper: this.helper, // Module helper
      logger: logger,
      message: message, // Full message
      parent: this,
      parsed: this.helper.parseCommandMessage(message),
      room: room, // Room this is from
      send: Misaka.prototype.send.bind(this, room.name),
      sender: username
    });

    // If a result was returned, assume it's a message, enqueue
    if(result !== undefined) {
      this.send(room.name, result);
    }
  } else if(!command) {
    this.print('No command found: ' + cmdname);
  } else if(!command.isEnabled()) {
    this.print('Command (or parent module) is disabled: ' + cmdname);
  }
};

Misaka.prototype.initRoom = function(room) {
  var misaka = this;

  // Initialize the message queue for this room
  this.initMessageQueue(room);

  room.on('message:added', function(snapshot) {
    var username = snapshot.username,
        message = snapshot.message;

    if(snapshot.whisper === undefined) {
      misaka.print(username + ': ' + message);
    } else {
      misaka.print(username + ' -> ' + snapshot.whisper + ': ' + message);
    }

    // If not a whisper, log the message in the db
    if(snapshot.whisper === undefined) {
      var db = misaka.getDbManager();
      db.insertMessageToLog(room.name, username, message, function(err) {
        if(err) {
          logger.error(err, { msg: 'Error logging message' });
        }
      });
    }

    // Check if command
    if(misaka.cmdproc.isCommand(username, message)
        && username.toLowerCase() != misaka.getConfig().getUsername().toLowerCase()) {
      misaka.processCommand(room, snapshot);
    }
  });

  room.on('user:added', function(snapshot) {
    if(snapshot.isPresent()) {
      misaka.print('*** ' + snapshot.username + ' has joined the room *** (' + snapshot.snapshot.key() + ')');
    }
  });

  room.on('user:removed', function(snapshot) {
    misaka.print('*** ' + snapshot.username + ' has left the room ***');
  });

  room.on('history', function(history) {
    // Not a snapshot for now
    // This may not order correctly?
    console.log('--- History ---');
    for(var key in history) {
      var message = history[key];
      console.log(message.user + ': ' + message.message);
    }
    console.log('--- End History ---');

    // Hacky for now.. Consider this point as "room joined"
    misaka.fireRoomJoin(room);
  });

  room.on('whisper', function(snapshot) {
    misaka.print('*whisper* ' + snapshot.from + ': ' + snapshot.message);
  });

  room.on('clear', function() {
    misaka.print('*** Room chat has been cleared by admin ***');
  });

  room.connect();
};

Misaka.prototype.printHelp = function() {
  console.log('Misaka - picarto.tv bot');
  console.log('usage: misaka [options]');
  console.log('');
  console.log('options:');
  console.log('  -h, --help    print this help message');
  console.log('  -r, --room    room to join');
  console.log('  --debug       enable debug logger');
};

var misaka = new Misaka();
