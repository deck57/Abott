var events = require('events');
var io = require('socket.io-client');
var path = require('path');
var request = require('request');
var _ = require('underscore');
var Firebase = require('firebase');
var UserList = require(path.join(__dirname, 'user_list'));
var OnlineWatcher = require(path.join(__dirname, 'online_watcher'));
var logger = require(path.join(__dirname, 'logger'));

// Path helper
BASE_URL = 'https://picarto.firebaseio.com';
var picarto = function(m) {
  return (m !== undefined ? (BASE_URL + '/' + m) : BASE_URL);
};

/**
 * Parse a boolean. Used for isPremium and isSubscriber.
 * @param str String to parse
 * @return true if parsed true, false if parsed false
 */
var parseBool = function(str) {
  // '1' if true, '' if false
  return str === '1';
};

/**
 * Construct a Picarto client.
 * @param opts Map of options
 */
var Client = function(opts) {
  this.authkey = opts['authkey'] || undefined;
  this.color = opts['color'] || '#';
  this.ip = opts['ip'] || '';
  this.premium = !!opts['premium'];
  this.subscriber = !!opts['subscriber'];
  this.username = opts['username'] || undefined;
  this.password = opts['password'] || undefined;

  this.emitter = new events.EventEmitter();
  this.hasAuthed = false;
  this.rooms = {};
  this.auth = new Auth();
};

/**
 * Authenticate and set this client's authkey to the
 * newly retrieved authkey.
 * @param callback Callback
 */
Client.prototype.authenticate = function(callback) {
  var client = this,
      username = this.username,
      password = this.password;

  if(username === undefined || password === undefined) {
    if(callback) {
      callback(new Error('Username and password are both required to authenticate'));
    }
    return;
  }

  logger.log('debug', 'Logging in', { username: username });
  this.auth.setCredentials(username, password);
  this.auth.perform(function(error, authkey) {
    if(!error) {
      client.authkey = authkey;
    }

    if(callback) callback(error);
  });
};

/**
 * Join a room, adding it to the `rooms` map.
 * @param roomname Name of room to join
 * @return room object
 */
Client.prototype.join = function(roomname) {
  roomname = roomname.toLowerCase();
  // Check if in room
  var room = this.rooms[roomname];
  if(room !== undefined) {
    logger.warn('Already in room', { room: roomname });
    return room;
  }

  room = this.rooms[roomname] = new Room(this, roomname);
  return room;
};

/**
 * Get a room by name.
 */
Client.prototype.getRoom = function(roomname) {
  return this.rooms[roomname];
};

/**
 * Listen for auth events. This will not fire on the initial
 * authentication, but will for all un-auth and re-auth events.
 * It provides authData to the callback in the same way that
 * Firebase's onAuth does.
 * @deprecated
 * @param callback Callback
 */
Client.prototype.onAuth = function(callback) {
  this.emitter.on('auth', callback);
};

/**
 * Listen for global messages.
 * @deprecated
 * @param callback Callback
 */
Client.prototype.onGlobalMessage = function(callback) {
  this.emitter.on('message:global', callback);
};

/**
 * Do stuff on first time being authenticated.
 * @param authData Data received after authentication.
 */
Client.prototype.initFirstAuth = function(authData) {
  if(!this.hasAuthed) {
    this.initReauth();
    this.joinDefaults();
  }
  this.hasAuthed = true;
};

/**
 * Connect to firebase. First checks for username/password and uses those
 * if possible, otherwise checks for authkey and uses that.
 * @param callback Callback
 */
Client.prototype.connect = function(callback) {
  // If username/password had, authenticate with them
  if(this.username !== undefined && this.password !== undefined) {
    this.connectWithCreds(callback);
  } else if(this.authkey !== undefined) { // Otherwise try authkey
    this.connectWithAuthkey(callback);
  } else {
    callback(new Error('Credentials or authkey are necessary to connect and authenticate'));
  }
};

/**
 * Connect to firebase using credentials (username/password). This basically
 * uses authenticate() to fetch the authkey using credentials, then calls
 * connectWithAuthkey().
 * @param callback Callback
 */
Client.prototype.connectWithCreds = function(callback) {
  var client = this;

  this.authenticate(function(error) {
    if(!error) {
      // Authkey should now be set
      client.connectWithAuthkey(callback);
    } else {
      if(callback) callback(error);
    }
  });
};

/**
 * Initialize what I guess is the main Firebase instance?
 * Also authenticates.
 * Perform the initial connection with this client, and authenticate.
 * @param authkey Authkey (optional)
 * @param callback Callback (optional)
 */
Client.prototype.connectWithAuthkey = function(authkey, callback) {
  var client = this;

  // If only argument is a function, assume callback
  if(arguments.length === 1 && (arguments[0] instanceof Function)) {
    callback = authkey;
    authkey = undefined;
  }

  // If no authkey provided, use this one
  if(authkey === undefined) {
    authkey = this.authkey;
  }

  logger.log('debug', 'Connecting to Firebase with authkey', { username: this.username });
  this.firebase = new Firebase(picarto());
  this.firebase.authWithCustomToken(authkey, function(err, authData) {
    if(err) {
      logger.error(err, 'Authentication error');
    } else {
      logger.info('Authenticated successfully');
      client.ip = authData.auth.ip;
      client.initFirstAuth();
    }

    if(callback) {
      callback(err, authData);
    }
  });
};

/**
 * Initialize the callback for deauth used for
 * re-authentication.
 */
Client.prototype.initReauth = function() {
  var client = this;

  // Setup callback to check for unauth
  this.firebase.onAuth(function(authData) {
    client.emitter.emit('auth', authData);
    if(!authData) { // Unauth'd
      // When unauth'd, clear current authkey
      client.authkey = undefined;
      client.authenticate(function(error) {
        if(!error) {
          logger.info('Successfully got new authkey');
          client.connectWithAuthkey(function(error, authData) {
            if(!error) {
              logger.info('Successfully re-authenticated');
            } else {
              logger.error(error, 'Error re-authenticating');
            }
          });
        } else {
          logger.error(error, 'Error getting new authkey');
        }
      });
    }
  });
};

/**
 * Create a message object from text that can be pushed
 * to firebase.
 * @param roomname Where this message will be pushed to
 * @param text Message text
 * @return Message object to push
 */
Client.prototype.createMessage = function(roomname, text) {
  return {
    user: this.username,
    color: this.color,
    isPremium: (this.premium ? '1' : ''),
    isSubscriber: (this.subscriber ? '1' : ''),
    message: text,
    whisper: 'none'
  };
};

/**
 * Create our user object to push.
 * @return user object to push
 */
Client.prototype.createUser = function() {
  return {
    color: this.color,
    chatUsername: this.username,
    isPremium: (this.premium ? '1' : ''),
    isSubscriber: (this.subscriber ? '1' : ''),
    ip: this.ip
  };
};

/**
 * Send a message to a room.
 * @param roomname Name of room to send message to
 * @param msg Text of message to send
 */
Client.prototype.message = function(roomname, msg) {
  var room = this.rooms[roomname];
  if(!room) return;

  var message = this.createMessage(msg);
  room.firebase.messages.push(message);
};

Client.prototype.whisper = function(roomname, user, msg) {
  var room = this.rooms[roomname];
  if(!room) return;
  // Does nothing for now
};

/**
 * Initialize default firebase stuff. Currently just global-messages.
 */
Client.prototype.joinDefaults = function() {
  var client = this;

  this.globalMessagesFirebase = new Firebase(picarto('global-messages'));
  this.globalMessagesFirebase.on('child_added', function(s) {
    client.emitter.emit('message:global', new GlobalMessageSnapshot(s));
  });

  // Parts of the client-side script seemed to remove the .info/, so maybe
  // it should just be 'connected'
  this.infoFirebase = new Firebase(picarto('connected'));

  this.infoFirebase.on('value', function(e) {
    if(e.val() === true) {
      // Disconnect?
      logger.warn('Disconnect?');
    }
  });
};

/**
 * Wrapper for emitter.emit.
 */
Client.prototype.emit = function() {
  this.emitter.emit.apply(this.emitter, arguments);
};

/**
 * Wrapper for emitter.on.
 */
Client.prototype.on = function() {
  this.emitter.on.apply(this.emitter, arguments);
  return this;
};

/**
 * Construct a new room. Used when a client joins
 * a room.
 * @param client Client parent object
 * @param name Room name
 */
var Room = function(client, name) {
  this.client = client;
  this.name = name;
  this.users = {};

  this.historyCount = 15;
  this.emitter = new events.EventEmitter();

  // Setup our user callbacks to keep track of users
  // Set this up before connecting so that we keep track of
  // ourself entering
  this.setupUserCallbacks();
};

/**
 * Connect to this room. Should be called after all events
 * have been set. Some events like 'history' will be right
 * after connecting.
 */
Room.prototype.connect = function() {
  var room = this,
      roomname = this.name;
  this.firebase = {};

  logger.log('debug', 'Joining room', { room: roomname });

  var f = this.firebase.room = new Firebase(picarto('rooms/' + roomname));
  var me = this.firebase.me = f.child('users/' + this.client.username.toLowerCase());
  this.firebase.messages = new Firebase(picarto('room-messages/' + roomname));
  this.firebase.whispers = new Firebase(picarto('room-whispers/' + roomname));
  this.firebase.clear = f.child('clear');
  this.firebase.users = f.child('users');
  this.firebase.admin = f.child('admin');
  this.firebase.mods = f.child('mods');
  this.firebase.bannedUsers = f.child('banned-users');
  this.firebase.bannedIps = f.child('banned-ip');

  // Initialize events
  this.initHistoryCallback();
  this.initUserCallbacks();
  this.initClearCallback();

  me.set(this.client.createUser());
};

/**
 * Send a message to this room.
 * @param text Text to send as message
 */
Room.prototype.message = function(text) {
  var msg = this.client.createMessage(this.name, text);
  this.firebase.messages.push(msg);
};

/**
 * Get a whisper sent to this client.
 * @param id Whisper id specified in received message object
 * @param callback Callback
 */
Room.prototype.getWhisper = function(id, callback) {
  this.firebase.whispers
    .child(this.client.username)
    .child(id).once('value', function(snapshot) {
      if(callback) {
        callback(snapshot); // Wrap in whisper snapshot?
      }
    });
};

/**
 * Set a callback for chat history.
 * @deprecated
 */
Room.prototype.onHistory = function(callback) {
  this.emitter.on('history', callback);
  return this;
};

/**
 * Set a callback for when a message is received.
 * @deprecated
 * @param callback Callback
 */
Room.prototype.onMessage = function(callback) {
  this.emitter.on('message:added', callback);
  return this;
};

/**
 * Set a callback for when a user joins the room.
 * Note: This also fires for this client.
 * @deprecated
 * @param callback Callback
 */
Room.prototype.onUserJoin = function(callback) {
  this.emitter.on('user:added', callback);
  return this;
};

/**
 * Set a callback for when a user is changed.
 * @deprecated
 * @param callback Callback
 */
Room.prototype.onUserChanged = function(callback) {
  this.emitter.on('user:changed', callback);
  return this;
};

/**
 * Set a callback for when a user leaves the room.
 * @deprecated
 * @param callback Callback
 */
Room.prototype.onUserLeave = function(callback) {
  this.emitter.on('user:removed', callback);
  return this;
};

/**
 * Set a callback for when someone has whispered this client.
 * @deprecated
 * @param callback Callback
 */
Room.prototype.onWhisper = function(callback) {
  this.emitter.on('whisper', callback);
  return this;
};

/**
 * Set a callback for when this room chat has been cleared by
 * an admin.
 * @deprecated
 * @param callback Callback
 */
Room.prototype.onClear = function(callback) {
  this.emitter.on('clear', callback);
  return this;
};

/**
 * Initialize the clear callback.
 */
Room.prototype.initClearCallback = function() {
  var room = this;

  this.firebase.clear.on('child_added', function(snapshot) {
    room.emitter.emit('clear', snapshot);
  });
};

/**
 * Initialize the history callback. This will initialize the
 * messages callbacks as well.
 */
Room.prototype.initHistoryCallback = function() {
  var room = this,
      base = this.firebase.messages;

  base.limitToLast(this.historyCount).once('value', function(snapshot) {
    room.history = snapshot.val(); // Set this history field

    // snapshot.val() returns null if history is empty
    if(!room.history) {
      room.history = {};
    }

    room.emitter.emit('history', room.history);

    // Only after the history has been received should the messages
    // callbacks be setup
    room.initMessagesCallbacks();
  });
};

/**
 * Initialize callbacks for messages.
 */
Room.prototype.initMessagesCallbacks = function() {
  var room = this,
      base = this.firebase.messages;

  this.ignoreCount = Object.keys(this.history).length;

  base.limitToLast(this.historyCount).on('child_added', function(snapshot) {
    // If still messages to ignore (that are in history),
    // ignore them and decrement counter
    if(room.ignoreCount > 0) {
      room.ignoreCount--;
    } else {
      var message = new MessageSnapshot(snapshot);
      room.emitter.emit('message:added', message);

      // If a whisper to us, emit the 'whisper' event as well
      if(message.whisper === room.client.username) {
        room.getWhisper(message.message, function(snapshot) {
          var whisper = new WhisperSnapshot(snapshot, message.username);
          room.emitter.emit('whisper', whisper);
        });
      }
    }
  });

  base.on('child_changed', function(snapshot) {
    room.emitter.emit('message:changed', new MessageSnapshot(snapshot));
  });

  base.on('child_removed', function(snapshot) {
    room.emitter.emit('message:removed', new MessageSnapshot(snapshot));
  });
};

/**
 * Initialize callbacks for users (/admin, /mods, /users, /bannedUsers).
 */
Room.prototype.initUserCallbacks = function() {
  var room = this;
  var init = [
    [ 'admin', this.firebase.admin ],
    [ 'mod', this.firebase.mods ],
    [ 'user', this.firebase.users ],
    [ 'banned', this.firebase.bannedUsers ]
  ];

  init.forEach(function(e) {
    var mode = e[0],
        firebase = e[1];

    firebase.on('child_added', function(snapshot) {
      room.emitter.emit('user:added', new UserSnapshot(snapshot, mode));
    });

    firebase.on('child_changed', function(snapshot) {
      room.emitter.emit('user:changed', new UserSnapshot(snapshot, mode));
    });

    firebase.on('child_removed', function(snapshot) {
      room.emitter.emit('user:removed', new UserSnapshot(snapshot, mode));
    });
  });
};

/**
 * Setup callbacks to keep track of users list.
 */
Room.prototype.setupUserCallbacks = function() {
  var room = this;

  this.emitter.on('user:added', function(snapshot) {
    if(snapshot.isPresent()) {
      var name = snapshot.snapshot.key();
      room.users[name] = snapshot;
    }
  });

  this.emitter.on('user:removed', function(snapshot) {
    var name = snapshot.snapshot.key();
    delete room.users[name];
  });
};

/**
 * Get the user by id (usually username).
 * @param id User id (username)
 * @return user snapshot from user:added, or undefined
 *         if user not found
 */
Room.prototype.getUser = function(id) {
  return this.users[id];
};

/**
 * Wrapper for emitter.emit.
 */
Room.prototype.emit = function() {
  this.emitter.emit.apply(this.emitter, arguments);
};

/**
 * Wrapper for emitter.on.
 */
Room.prototype.on = function() {
  this.emitter.on.apply(this.emitter, arguments);
  return this;
};

/**
 * Wrapper for user-related snapshots.
 * @param snapshot Original snapshot object
 * @param mode User mode (admin, mod, user, banned)
 */
function UserSnapshot(snapshot, mode) {
  this.snapshot = snapshot;
  // Mode should be either: admin, mod, user, banned
  this.mode = mode;

  // Assign fields from val
  var val = snapshot.val();

  // Mods/admins may only have one field, "user' with username
  // This only happens when they aren't actually present in the room
  if(_.size(val) === 1) {
    this.username = val.user;
    this.present = false;
  } else {
    this.color = val.color;
    this.ip = val.ip;
    this.premium = parseBool(val.isPremium);
    this.subscriber = parseBool(val.isSubscriber);
    this.username = val.chatUsername;
    this.present = true;
  }
};

/**
 * Whether or not the user is present.
 * @return {Boolean} true if present, false if not
 */
UserSnapshot.prototype.isPresent = function() {
  return this.present === true;
};

/**
 * Wrapper for message snapshots.
 * @param snapshot Original snapshot object
 */
function MessageSnapshot(snapshot) {
  this.snapshot = snapshot;

  var val = snapshot.val();
  this.color = val.color;
  this.message = val.message;
  this.premium = parseBool(val.isPremium);
  this.subscriber = parseBool(val.isSubscriber);
  this.username = val.user;
  this.whisper = (val.whisper === 'none' ? undefined : val.whisper);
};

function GlobalMessageSnapshot(snapshot) {
  this.snapshot = snapshot;
  this.message = snapshot.val().globalmessage;
};

/**
 * Wrapper for whisper snapshots (sent to this client).
 * @param snapshot Original snapshot object
 * @param from Username of user who sent the whisper
 */
function WhisperSnapshot(snapshot, from) {
  this.snapshot = snapshot;
  this.from = from;
  this.message = snapshot.val().message;
};

/**
 * Client for V7 chat.
 */
function ClientV7(opts) {
  if(!opts) opts = {};

  this.token = opts['token'];
  this.userList = undefined;
  this.onlineWatcher = undefined;

  // Awaiting history until channelUsers event (UserList's "initial" event)
  this.awaitingHistory = true;
  this.history = [];

  this.emitter = new events.EventEmitter();
};

/**
 * Connect to the websocket server with an authentication token.
 * @param token Auth token (optional)
 * @return socket
 */
ClientV7.prototype.connectWithToken = function(token) {
  // Make sure we have a token
  if(!token) {
    token = this.token;
    if(!token) {
      logger.error('Cannot connect to V7 chat without a token');
      return;
    }
  }

  logger.log('debug', 'Connecting to socket.io server');
  var socket = this.socket = io.connect('https://nd1.picarto.tv:443', {
    secure: true,
    query: 'token=' + token
  });

  // Unsure if this is the best place..
  this.initUserList();
  this.initOnlineWatcher();
  this.initHistory();

  return socket;
};

ClientV7.prototype.initOnlineWatcher = function() {
  this.onlineWatcher = new OnlineWatcher();
  this.onlineWatcher.setSocket(this.socket);
};

/**
 * Initialize the user list. Assumes socket has been set (this.socket).
 */
ClientV7.prototype.initUserList = function() {
  var userList = this.userList = new UserList();
  userList.setSocket(this.socket);
};

/**
 * Initialize history stuff.
 */
ClientV7.prototype.initHistory = function() {
  var client = this, userList = this.userList;

  this.socket.on('userMsg', function(data) {
    if(client.awaitingHistory) {
      data.history = true; // Mark this message as history
      client.history.push(data);
    }
  });

  // All messages received before initial userlist (channelUsers) are
  // part of history
  userList.on('initial', function(users) {
    client.awaitingHistory = false;
    client.emit('history', client.history);
  });
};

/**
 * Get the online watcher.
 * @return {Object} Online watcher
 */
ClientV7.prototype.getOnlineWatcher = function() {
  return this.onlineWatcher;
};

/**
 * Get the socket of this client.
 * @return socket
 */
ClientV7.prototype.getSocket = function() {
  return this.socket;
};

/**
 * Get this client's UserList for managing user events.
 * @return UserList
 */
ClientV7.prototype.getUserList = function() {
  return this.userList;
};

/**
 * Send a request to set this client's color.
 * @param color Color to set to, should be exactly 6 hex characters
 *              (otherwise it will be ignored by the server)
 */
ClientV7.prototype.setColor = function(color) {
  this.socket.emit('setColor', color);
};

/**
 * Send a message.
 * @text Text of message to send
 */
ClientV7.prototype.sendMessage = function(text) {
  this.socket.emit('chatMsg', { msg: text });
};

/**
 * Send a chat command.
 * @param cmd Command name
 * @param arg Everything that follows the command name
 */
ClientV7.prototype.sendCommand = function(cmd, arg) {
  this.sendMessage('/' + cmd + ' ' + arg);
};

/**
 * Send a ban command.
 * @param username Username of user to ban
 */
ClientV7.prototype.ban = function(username) {
  this.sendCommand('b', username);
};

/**
 * Send an unban command.
 * @param username Username of user to unban
 */
ClientV7.prototype.unban = function(username) {
  this.sendCommand('ub', username);
};

/**
 * Send a mod command.
 * @param username Username of user to become a moderator
 */
ClientV7.prototype.mod = function(username) {
  this.sendCommand('m', username);
};

/**
 * Send an unmod command.
 * @param username Username of user to remove from moderators
 */
ClientV7.prototype.unmod = function(username) {
  this.sendCommand('um', username);
};

/**
 * Send a kick command.
 * @param username Username of user to kick
 */
ClientV7.prototype.kick = function(username) {
  this.sendCommand('kick', username);
};

/**
 * Whisper another user.
 * @param username Username of user to whisper
 * @param text Text to whisper
 */
ClientV7.prototype.whisper = function(username, text) {
  this.sendCommand('w', username + ' ' + text);
};

/**
 * Wrapper for emitter.emit.
 */
ClientV7.prototype.emit = function() {
  this.emitter.emit.apply(this.emitter, arguments);
};

/**
 * Wrapper for emitter.on.
 */
ClientV7.prototype.on = function() {
  this.emitter.on.apply(this.emitter, arguments);
  return this;
};

/**
 * Handle picarto's web authentication procedure, used
 * mainly for getting an authkey for an account.
 */
function Auth() {
  this.username = undefined;
  this.password = undefined;
  this.jar = request.jar(); // Cookie jar
};

/**
 * Set the credentials (username and password) for this Auth instance.
 * @param username Username to set
 * @param password Password to set
 */
Auth.prototype.setCredentials = function(username, password) {
  this.username = username;
  this.password = password;
};

/**
 * Fetch a PHPSESSID cookie.
 * @param callback Callback
 */
Auth.prototype.fetchSessionCookie = function(callback) {
  request({
    uri: 'https://www.picarto.tv/live/index.php',
    jar: this.jar,
    headers: this.getRequestHeaders()
  }, function(error, response, body) {
    if(response && response.statusCode !== 200 && !error) {
      error = new Error('Unexpected status code when fetching session cookie: ' + response.statusCode);
    }

    if(callback) callback(error);
  });
};

/**
 * Attempt to login to picarto.
 * @param username Username to login with
 * @param password Password to login with
 * @param callback Callback
 */
Auth.prototype.login = function(username, password, callback) {
  var auth = this, data = { username: username, password: password, staylogged: false };

  request({
    uri: 'https://picarto.tv/process/login',
    method: 'POST',
    form: data,
    jar: this.jar,
    headers: this.getRequestHeaders()
  }, function(error, response, body) {
    // Check status code
    if(response && response.statusCode !== 200) {
      if(!error) error = new Error('Unexpected status code while logging in: ' + response.statusCode);
    }

    if(callback && !error) {
      callback(error, auth.wasLoginSuccessful(body));
    } else if(callback) {
      callback(error);
    }
  });
};

/**
 * Fetch this user's authkey. Assumes the cookie jar has
 * PHPSESSID set to a valid session cookie.
 * @param callback Callback
 */
Auth.prototype.fetchAuthkey = function(callback) {
  var auth = this;

  request({
    uri: 'https://www.picarto.tv/live/channel.php?watch=' + this.username.toLowerCase(),
    followRedirect: false,
    jar: this.jar,
    headers: this.getRequestHeaders()
  }, function(error, response, body) {
    if(response && !error) {
      var status = response.statusCode;
      if(status !== 200 && status !== 302) {
        error = new Error('Unexpected status code while fetching authkey: ' + status);
      }
    }

    // Try to parse the authkey
    var authkey;
    if(!error) {
      authkey = auth.parseAuthkey(body);
      if(!authkey) {
        error = new Error('Error parsing authkey');
      }
    }

    if(callback) callback(error, authkey);
  });
};

/**
 * Parse an authkey from html.
 * @param html Html to look through
 * @return authkey if found, undefined if not found
 */
Auth.prototype.parseAuthkey = function(html) {
  var patt = /dataRef\.auth\("([^"]+)"/,
      match = patt.exec(html);

  if(match) {
    return match[1];
  }
};

/**
 * Parse an auth token from Html.
 * @param html Html to look through
 * @return auth token if found, undefined if not found
 */
Auth.prototype.parseAuthToken = function(html) {
  var patt = /initChatVariables\(.*,'(.+)'\)/,
      match = patt.exec(html);

  if(match) {
    return match[1];
  }
};

/**
 * Check if a login was successful from the body of the
 * response.
 * @param html Html received in response
 * @return true if successful, false if not
 */
Auth.prototype.wasLoginSuccessful = function(response) {
  var json = JSON.parse(response);
  logger.log('debug', 'Login object', { json: json });
  return json['loginstatus'] === true;
};

/**
 * Get the headers to send with requests.
 * @return headers object
 */
Auth.prototype.getRequestHeaders = function() {
  return { 'Referer': 'https://www.picarto.tv/live/index.php' };
};

/**
 * Grab a session cookie, login, and get the authkey.
 * @param callback Callback
 */
Auth.prototype.perform = function(callback) {
  var auth = this,
      username = auth.username, password = auth.password;

  this.fetchSessionCookie(function(error) {
    if(!error) {
      auth.login(username, password, function(error, success) {
        if(!error && success) {
          auth.fetchAuthkey(function(error, authkey) {
            callback(error, authkey);
          });
        } else if(!error && !success) {
          if(callback) callback(new Error('Login failed'));
        } else {
          if(callback) callback(error);
        }
      });
    } else {
      callback(error);
    }
  });
};

/**
 * Get the token for a room, assuming this Auth is already logged in.
 * Basically V7 version of fetchAuthkey.
 * @param roomname Name of room to get token for
 * @param callback Callback(error, token)
 */
Auth.prototype.fetchAuthToken = function(roomname, callback) {
  var auth = this;

  request({
    uri: 'https://picarto.tv/' + roomname,
     jar: this.jar,
     headers: this.getRequestHeaders()
   }, function(error, response, body) {
    // Check status code
    if(response && !error) {
      var status = response.statusCode;
      if(status !== 200 && status !== 302) {
        error = new Error('Unexpected status code while fetching auth token: ' + status);
      }
    }

    // Try to parse the auth token
    var authToken;
    if(!error) {
      authToken = auth.parseAuthToken(body);
      if(!authToken) {
        error = new Error('Error parsing auth token');
      }
    }

    if(callback) {
      callback(error, authToken);
    }
  });
};

module.exports = { Auth: Auth, Client: Client, ClientV7: ClientV7, Room: Room };
