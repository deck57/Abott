var fs = require('fs');
var osenv = require('osenv');
var path = require('path');
var _ = require('underscore');
_.str = require('underscore.string');
_.mixin(_.str.exports());
var logger = require(path.join(__dirname, 'logger'));

var DEFAULT_COLOR = '#000000';

var Config = function() {
  this.obj = {};
};

/**
 * Check that a color matches a specific pattern.
 * @param color Color string to check
 * @return true if the color matches and is valid, false if not
 */
Config.prototype.checkColor = function(color) {
  return (/^#[a-f0-9]{6}$/i).test(color);
};

/**
 * Attempt to create the default config directory, relative
 * to user's home path.
 */
Config.prototype.createDirectorySync = function() {
  return;
  var dir = path.join(osenv.home(), '.config', 'misaka');

  try {
    var res = fs.statSync(dir);
    if(res.isDirectory()) {
      logger.log('debug', 'Config directory already exists', { path: dir });
    } else {
      logger.error('Unable to create config directory, exists but isn\'t a directory', { path: dir });
    }
  } catch(err) {
    // Nothing exists, try to create
    try {
      fs.mkdirSync(dir);
      logger.log('debug', 'Config directory created', { path: dir });
    } catch(err) {
      logger.error(err, { msg: 'Attempt to create config directory failed', path: dir });
    }
  }
};

/**
 * Set this config instance from a loaded JSON object.
 * @param obj Loaded JSON object
 */
Config.prototype.setFrom = function(obj) {
  this.obj = obj;
  /*
  if(obj.authkey !== undefined) this.authkey = obj.authkey;
  if(obj.color !== undefined) this.color = obj.color;
  if(obj.username !== undefined) this.username = obj.username;
  if(obj.password !== undefined) this.password = obj.password;
  if(obj.room !== undefined) this.room = obj.room;
  if(obj.master !== undefined) this.master = obj.master;
  if(obj.logging !== undefined) this.logging = obj.logging;
  if(obj.modules !== undefined) this.modules = obj.modules;
  */
};

Config.prototype.getUsername = function() {
  return this.getIfString(this.obj.username);
};

Config.prototype.getPassword = function() {
  return this.getIfString(this.obj.password);
};

Config.prototype.getAuthkey = function() {
  return this.getIfString(this.obj.authkey);
};

/**
 * Get the sqlite3 database file path.
 * @return {String} Database file path, or undefined if none
 */
Config.prototype.getDbPath = function() {
  return this.getIfString(this.obj.dbPath);
};

/**
 * Get the auth token (same as authkey, but used for V7 chat).
 * @return auth token
 */
Config.prototype.getAuthToken = function() {
  return this.getIfString(this.obj.authToken);
};

Config.prototype.getMaster = function() {
  return this.getIfString(this.obj.master);
};

Config.prototype.getDescription = function() {
  return this.getIfString(this.obj.description);
};

/**
 * Get the rooms to join as specified. Currently only gets
 * one room ("room").
 * @return array of rooms to join, or an empty array if none
 */
Config.prototype.getRooms = function() {
  var room = this.getIfString(this.obj.room);
  if(room !== undefined) {
    return [room];
  } else {
    return [];
  }
};

/**
 * Get the color.
 * @return color as a string, or DEFAULT_COLOR if bad color
 *         format or none found.
 */
Config.prototype.getColor = function() {
  var color = this.getIfString(this.obj.color);
  // Return default color if bad format
  if(!color || !this.checkColor(color)) {
    return DEFAULT_COLOR;
  }
  return color;
};

/**
 * Get the config object for a specific module.
 * @param name Name of module
 * @return config object for specified module, or undefined if none
 */
Config.prototype.getModuleConfig = function(name) {
  if(this.obj.modules && this.obj.modules[name]
  && _.isObject(this.obj.modules[name])) {
    return this.obj.modules[name];
  }
};

/**
 * Set the room.
 * @param room Room name
 */
Config.prototype.setRoom = function(room) {
  if(_.isString(room)) {
    this.obj.room = room;
  }
};

/**
 * Return parameter if it is a string.
 * @param o What to return if a string
 * @return o if o is a string, otherwise undefined
 */
Config.prototype.getIfString = function(o) {
  if(_.isString(o)) return o;
};

/**
 * Read a configuration JSON file.
 * @param path Filepath to open
 * @param callback Callback
 */
Config.prototype.read = function(path, callback) {
  var config = this;
  fs.readFile(path, function(err, data) {
    if(err) {
      if(callback) {
        callback(err);
      }
      return;
    }

    var obj = JSON.parse(data);
    config.setFrom(obj);

    if(callback) {
      callback();
    }
  });
};

/**
 * Read a configuration JSON file synchronously.
 * @param path Filepath to open
 * @return true if successful, false if error reading file
 */
Config.prototype.readSync = function(path) {
  var data = fs.readFileSync(path);
  if(!data) {
    return false;
  }

  // XOXOXO
  //var obj = JSON.parse(data);
  eval("var obj = " + data);
  // XOXOXO
  this.setFrom(obj);
  return true;
};

/**
 * Get the default path to the config directory for a specific user.
 * @return path to default directory
 */
Config.getDefaultDirectory = function() {
  var getUserHome = function() {
    return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
  };
  return path.join(getUserHome(), '.config', 'misaka');
};

/**
 * Get the default path of a config file.
 * @param name Filename ('.json' will be appended if not already)
 * @return path to config file
 */
Config.getDefaultPath = function(name) {
  return "./" + name + ".json"; // XOXOXO
  var dirpath = Config.getDefaultDirectory();
  if(!_(name).endsWith('.json')) name = (name + '.json');
  return path.join(dirpath, name);
};

module.exports = { Config: Config };
