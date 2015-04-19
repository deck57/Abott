var path = require('path');
var winston = require('winston');

function Logger() {
  this.initWinston();

  this.enabled = {
    detection: false
  };
};

/**
 * Get the default name for a logfile path.
 * @param name Name of log file
 * @return file path
 */
Logger.prototype.logPath = function(name) {
  return path.join(__dirname, '..', 'logs', name + '.log');
};

/**
 * Initialize our winston loggers.
 */
Logger.prototype.initWinston = function() {
  // Default console logger
  this.console = new winston.Logger({
    transports: [
      new (winston.transports.Console)({
        colorize: true,
        label: 'misaka',
        timestamp: true
      })
    ]
  });

  // Error logger
  this.errors = new winston.Logger({
    transports: [
      new (winston.transports.File)({
        filename: this.logPath('error')
      })
    ]
  });

  // Loggers for detection module
  this.detection = {
    // Logger for html gotten from mod_detection.
    html: new winston.Logger({
      transports: [
        new (winston.transports.File)({
          filename: this.logPath('detection_html'),
          json: false,
          timestamp: true
        })
      ]
    }),

    // Log every state check
    state: new winston.Logger({
      transports: [
        new (winston.transports.File)({
          filename: this.logPath('detection_state')
        })
      ]
    })
  };
};

Logger.prototype.logError = function(err) {
  this.errors.error(err.toString());
};

/**
 * Set whether or not to log detection stuff.
 * @param en true if enable, false if disable
 */
Logger.prototype.enableDetection = function(en) {
  this.enabled.detection = en;
};

Logger.prototype.logDetectionState = function(isInitial, channel, state) {
  if(this.enabled.detection) {
    this.detection.state.info('fetched state', { isInitial: isInitial, channel: channel, state: state });
  }
};

Logger.prototype.logDetectionStateChange = function(state, diffString) {
  if(this.enabled.detection) {
    this.detection.state.info('state change detected', { diff: diffString, state: state });
  }
};

Logger.prototype.logDetectionHtml = function(page, html) {
  if(this.enabled.detection) {
    this.detection.html.info(html, { page: page });
  }
};

Logger.prototype.log = function() {
  console.log(arguments[1]);
  this.console.log.apply(this.console, arguments);
};

Logger.prototype.info = function() {
  this.console.info.apply(this.console, arguments);
};

Logger.prototype.warn = function() {
  this.console.warn.apply(this.console, arguments);
};

Logger.prototype.error = function() {
  this.console.error.apply(this.console, arguments);
};

/**
 * Set the logging level of the console logger.
 * @param lvl Logging level
 */
Logger.prototype.setLevel = function(lvl) {
  this.console.transports.console.level = lvl;
};

var singleton = new Logger();
module.exports = singleton;
