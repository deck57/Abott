var events = require('events');
var net = require('net');
var osenv = require('osenv');
var path = require('path');
var _ = require('underscore');
_.str = require('underscore.string');
var util = require(path.join(__dirname, '..', 'util'));
var logger = require(path.join(__dirname, '..', 'logger'));

var SocketInterface = function(socketsPath) {
  //socketsPath = (path.join(osenv.home(), '.config', 'misaka', 'sockets'));
  socketsPath = "./sockets"; // XOXOXO
  this._path = socketsPath;
  this._emitter = new events.EventEmitter();

  if(this.createDirectorySync()) {
    this._initServer();
  }
};

/**
 * Close any open sockets, calling the callback
 * when complete.
 */
SocketInterface.prototype.close = function(callback) {
  this._sendServer.close(callback);
};

/**
 * Try to create the socket directory.
 */
SocketInterface.prototype.createDirectorySync = function() {
  return util.tryCreateDirectorySync(this._path);
};

/**
 * Get the path to the directory at which the UNIX sockets
 * are located.
 * @param {String} [filename] Specific file path relative
 *                            to the sockets directory
 * @return {String} Path to sockets directory
 */
SocketInterface.prototype.getPath = function(filename) {
  var p = this._path;

  if(filename !== undefined) {
    p = path.join(p, filename);
  }

  return p;
};

/**
 * Get the path to the socket used for sending a message
 * to the chat.
 * @return {String} Path to send socket
 */
SocketInterface.prototype.getSendPath = function() {
  return this.getPath('send');
};

/**
 * Wrapper function for EventEmitter#on().
 */
SocketInterface.prototype.on = function() {
  this._emitter.on.apply(this._emitter, arguments);
};

/**
 * Initialize the sockets. Currently just the 'send' socket.
 */
SocketInterface.prototype._initServer = function() {
  var emitter = this._emitter;

  // Initialize the send socket
  var sendServer = this._sendServer = net.createServer(function(c) {
    logger.log('debug', 'Server created for SocketInterface (send)');

    c.on('data', function(data) {
      var message = data.toString();
      message = _.str.trim(message);

      if(message !== '') {
        //logger.log('debug', 'Message read from SocketInterface (send)', { msg: message });
        emitter.emit('sendMsg', message);
      }
    });

    c.on('end', function() {
      logger.log('debug', 'Client disconnected from SocketInterface (send)');
    });
  });

  sendServer.listen(global.misaka.config.obj.port); // XOXOXO
};

module.exports = SocketInterface;
