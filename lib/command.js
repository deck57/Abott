var _ = require('underscore');

function Command(info) {
  this.parent = undefined; // May or may not have a module
  this.info = info;
  this.enabled = true;

  this.users = {}; // Store users for cooldown tracking
  this.defaultCooldown = 10000;
}

Command.prototype.name = function() {
  return this.info.name;
};

Command.prototype.module = function() {
  return this.parent;
};

/**
 * Get the cooldown for this command (per user) in milliseconds.
 * @return cooldown in milliseconds
 */
Command.prototype.cooldown = function() {
  var c = this.info.cooldown;

  // If false, use zero
  if(c === false) {
    return 0;
  }

  // If a positive number, use that
  if(_.isNumber(c) && c > 0) {
    return c;
  }

  // Otherwise use default
  return this.defaultCooldown;
};

/**
 * Whether or not this command is enabled.
 */
Command.prototype.isEnabled = function() {
  return this.enabled && (this.module() ? this.module().isEnabled() : true);
};

/**
 * Whether or not this command is master-only by default.
 * @return true if master-only, false otherwise
 */
Command.prototype.isMasterOnly = function() {
  return this.info.master === true || (this.module() ? this.module().isMasterOnly() : false);
};

/**
 * Gets the full command name. This factors in the module name
 * if this command was loaded from a module.
 * @return Full command name
 */
Command.prototype.getFullName = function() {
  if(this.module()) {
    return this.module().name() + '.' + this.name();
  }
  else {
    return this.name();
  }
};

/**
 * Create a command from command info presented by a module.
 * @param module Module in which cmdinfo was found
 * @param cmdinfo Command info
 * @return Command
 */
Command.fromInfo = function(module, cmdinfo) {
  var command = new Command(cmdinfo);
  command.parent = module;
  return command;
};

/**
 * @Deprecated?
 * Get an array of commands from a module, as a module may
 * provide any number of commands.
 * @param module Module to get commands from
 * @return Array of commands, or an empty array if none
 */
Command.getAllFromModule = function(module) {
  var commands = [];

  if(module === undefined || module.info === undefined) {
    return;
  }

  var info = module.info;
  var infocmds = [];

  // May have 'command' for one command, or 'commands' for an array of commands
  if(info.command !== undefined) {
    infocmds.push(info.command);
  } else if(info.commands !== undefined && info.commands instanceof Array) {
    infocmds = info.commands;
  }

  infocmds.forEach(function(c) {
    var command = Command.fromInfo(module, c);
    if(command) {
      commands.push(command);
    }
  });

  return commands;
};

Command.prototype.execute = function(data) {
  return this.info.callback(data);
};

/**
 * Mark that this command has just been used by a user,
 * and should be factored into cooldown.
 * @param username Username of user who just used the command
 */
Command.prototype.used = function(username) {
  this.users[username] = (new Date()).getTime();
};

/**
 * Whether or not a user can use this command.
 * @param user Username to check for
 * @return true if the command can be used, false if not
 */
Command.prototype.canBeUsed = function(username) {
  //XOXOXO
  if (username == global.misaka.config.obj.master)
    return true;
  //XOXOXO
  // For now just check cooldown
  var timestamp = this.users[username],
      cooldown = this.cooldown(), now = (new Date()).getTime();
  if(timestamp === undefined || cooldown === 0) {
    return true;
  } else {
    return ((timestamp + cooldown) < now);
  }
};

module.exports = Command;
