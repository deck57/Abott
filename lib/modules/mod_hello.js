// WARNING: This code should get me banned from the coder guild.

function HelloModule() {
    this.C = global.misaka.config.obj.modules.Hello;

    this.info = {
        name: 'Hello',
        description: 'Say hello!',
        commands: [
          { name: 'hellostart', callback: HelloModule.prototype.onStart.bind(this) },
          { name: 'helloend', callback: HelloModule.prototype.onEnd.bind(this) },
          { name: 'starthello', callback: HelloModule.prototype.onStart.bind(this) },
          { name: 'endhello', callback: HelloModule.prototype.onEnd.bind(this) },
        ],
        callbacks: { 'join': HelloModule.prototype.onJoin.bind(this) },
        master: true,
        cooldown: this.C.userCommandCooldown,
    };

    this._started = false;
    this._usersHello = {};
    this._usersConnectionDate = {};
}

HelloModule.prototype.onJoin = function(data)
{
    var self = this;
    var client = global.misaka.getBot().getClient();

    client.getSocket().on('userMsg', function(data) { if (!data.history) { self.onMessage(data); }});
    client.getUserList().on('initial', function(users) {
        users.forEach(function(user) { self._usersHello[user.username] = true; });
        self._started = self.C.enable;

        if (self.C.start_bot_message && self.C.start_bot_message.length)
            self.send(self.getString(self.C.start_bot_message));
    });
    client.getUserList().on('userAdded', function(user) {
        if (!self._usersHello[user.username] && !self._usersConnectionDate[user.username])
            self._usersConnectionDate[user.username] = new Date().getTime();
    });
};

HelloModule.prototype.onStart = function(data)
{
    this._started = true;
    return this.getString(this.C.module_start_message, data.sender);
};

HelloModule.prototype.onEnd = function(data)
{
    this._started = false;
    return this.getString(this.C.module_end_message, data.sender);
};

HelloModule.prototype.onMessage = function(data)
{
    var client = global.misaka.getBot().getClient();

    if (data.username != global.misaka.config.obj.username)
    {
        if (!this._usersHello[data.username])
        {
            var connectionDate = this._usersConnectionDate[data.username];
            delete this._usersConnectionDate[data.username];
            if (connectionDate && connectionDate < new Date().getTime() - this.C.cooldown * 1000)
                return ;
            this._usersHello[data.username] = true;
            if (!this._started)
                return ;
            var usersC = global.misaka.config.obj.users[data.username.toLowerCase()];
            if (usersC && usersC.hello)
                this.send(this.getString(usersC.hello, data.username));
            else
                this.send(this.getString(this.C.messages, data.username));
        }
    }
}

HelloModule.prototype.getString = function(c, user)
{
    if (!c || !c.length)
        return "";
    var str;
    if (c instanceof Array)
        str = this.randomElement(c);
    else
        str = c;
    if (user)
        str = this.replaceUser(str, user);
    return str;
};

HelloModule.prototype.replaceUser = function(str, user)
{
    var userC = global.misaka.config.obj.users[user.toLowerCase()];
    if (userC && userC.alias)
        user = this.getString(userC.alias);
    return str.replace(/%user/g, user);
};

HelloModule.prototype.randomElement = function(array)
{
    return array[Math.min(Math.floor(Math.random() * array.length), array.length - 1)];
};

HelloModule.prototype.send = function(message)
{
    global.misaka.send(global.misaka.config.obj.room, message);
};

module.exports = HelloModule;
