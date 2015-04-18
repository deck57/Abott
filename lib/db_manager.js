var osenv = require('osenv');
var path = require('path');
var sql = require('sql');
var sqlite3 = require('sqlite3');
var logger = require(path.join(__dirname, 'logger'));

var DbManager = function(opts) {
  if(!opts) opts = {};
  this.path = opts['path'];

  if(this.path === undefined || this.path === null) {
    this.path = this.getDefaultPath();
  }

  this._initialized = false;
  var _this = this;

  this.initTableHandlers();
  this.initDatabase(function(err) {
    if(!err) {
      _this._initialized = true;
      logger.log('debug', 'Successfully initialized database', { path: _this.getPath() });
    } else {
      logger.error(err, { msg: 'Error initializing database' });
    }
  });
};

/**
 * Check whether or not this database manager is initialized.
 * If not, calls the callback with an error.
 * @param {errorCallback} callback
 * @return {Boolean} true if initialized, false if not
 */
DbManager.prototype.checkInitialized = function(callback) {
  if(!this.isInitialized()) {
    var err = new Error('Database manager isn\'t yet initialized');
    if(callback) {
      callback(err);
    }

    return false;
  }

  return true;
};

/**
 * Get the database file path of this database manager.
 * @return {String} Database file path
 */
DbManager.prototype.getPath = function() {
  return this.path;
};

/**
 * Get the default database file path, relative to the running user's directory.
 * @return {String} Default database file path
 */
DbManager.prototype.getDefaultPath = function() {
  return "./misaka.db"; // XOXOXO
  return path.join(osenv.home(), '.config', 'misaka', 'misaka.db');
};

/**
 * Check whether or not this database has been initialized.
 * @return {Boolean} true if initialized, false if not
 */
DbManager.prototype.isInitialized = function() {
  return this._initialized === true;
};

/**
 * Get the last log entry for a user in a channel. Untested.
 * @param {String} channel Channel name
 * @param {String} username Username
 */
DbManager.prototype.getLastLogEntry = function(channel, username, callback) {
  if(!this.checkInitialized(callback)) {
    return;
  }

  var channel_log = this._tables.channel_log,
      query = channel_log.select(channel_log.star()).from(channel_log)
                .where(channel_log.channel.equals(channel).and(channel_log.user.equals(username)))
                .order(channel_log.id.desc).limit(1)
                .toString();

  // Hacky workaround for node-sql's lack of specifying case insensitive field
  query = query.replace(')) ORDER', ' COLLATE NOCASE)) ORDER');
  //logger.log('debug', 'getLastLogEntry', { query: query });

  this._db.all(query, function(err, rows) {
    var row;
    if(!err && rows.length > 0) {
      row = rows[0];
    }

    if(callback) {
      callback(err, row);
    }
  });
};

DbManager.prototype.getMessageLogCount = function(roomname, dateMod, callback) {
  if(!this.checkInitialized(callback)) {
    return;
  }

  var channel_log = this._tables.channel_log,
      query = channel_log.select(channel_log.id.count().distinct().as('count'))
                .from(channel_log)
              .toString();

  query += ' WHERE "timestamp" > DATETIME("now", "' + dateMod + '")';

  this._db.all(query, function(err, row) {
    var count;
    if(!err) {
      count = row[0].count;;
    }

    if(callback) {
      callback(err, count);
    }
  });
};

/**
 * Insert a message into the log table.
 * @param {String} channel Channel name
 * @param {String} username Username
 * @param {String} msg Message text
 * @param {errorCallback} callback
 */
DbManager.prototype.insertMessageToLog = function(channel, username, msg, callback) {
  if(!this.checkInitialized(callback)) {
    return;
  }

  var channel_log = this._tables.channel_log,
      query = channel_log.insert(
                channel_log.channel.value(channel),
                channel_log.user.value(username),
                channel_log.action.value('msg'),
                channel_log.data.value(msg))
              .toString();
  //logger.log('debug', 'insertMessageToLog', { query: query });
  this._db.run(query, callback);
};

/**
 * Initialize _tables.
 */
DbManager.prototype.initTableHandlers = function() {
  var sqlite = new sql.Sql('sqlite');
  this._tables = {
    channel_log: sqlite.define({
      name: 'channel_log',
      columns: [
        { name: 'id', dataType: 'INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL' },
        { name: 'channel', dataType: 'varchar(64)', notNull: true },
        { name: 'user', dataType: 'varchar(64)', notNull: true },
        { name: 'action', dataType: 'varchar(8)', notNull: true },
        { name: 'data', dataType: 'varchar(256)' },
        { name: 'timestamp', dataType: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
      ],
      charset: 'utf8'
    })
  };
};

/**
 * Initialize the sqlite3 database.
 * @param {errorCallback} callback
 */
DbManager.prototype.initDatabase = function(callback) {
  // Unsure if this is always async, or only if passed a callback
  var _this = this;
  var db = this._db = new sqlite3.Database(this.path, function(err) {
    if(!err) {
      _this.createTables(callback);
    } else if(callback) {
      callback(err);
    }
  });
};

/**
 * Create the tables for the database if they don't exist.
 * Currently only creates the channel_log table.
 * @param {errorCallback} callback
 */
DbManager.prototype.createTables = function(callback) {
  var channel_log = this._tables.channel_log,
      query = channel_log.create().ifNotExists().toQuery().text;
  logger.log('debug', 'Creating channel_log table if it doesn\'t exist', { query: query });
  this._db.run(query, callback);
};

/**
 * Callback with only an error parameter.
 * @callback errorCallback
 * @param {Object} error if an error occurred
 */

module.exports = DbManager;
