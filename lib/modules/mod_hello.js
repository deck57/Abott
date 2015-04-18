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
    this._cooldown = [];
}

HelloModule.prototype.onJoin = function(data)
{
    var client = global.misaka.getBot().getClient();
    var self = this;

console.log(data);
    client.getSocket().on('userMsg', function(data) { if (!data.history) { self.onMessage(data); }});
    client.getUserList().on('initial', function(users) {
        users.forEach(function(user) {
            //self._usersHello[user.username] = true;
        });
        self._started = self.C.enable;
    });
    client.socket

    if (!this.C.start_bot_message || !this.C.start_bot_message.length)
        return ;
    client.sendMessage(this.getString(this.C.start_bot_message));
};

HelloModule.prototype.onStart = function(data)
{
    this._started = true;
    return this.getString(this.C.module_start_message);
};

HelloModule.prototype.onEnd = function(data)
{
    this._started = false;
    return this.getString(this.C.module_end_message);
};

HelloModule.prototype.onMessage = function(data)
{
    var client = global.misaka.getBot().getClient();

    if (this._started && data.username != global.misaka.config.obj.username)
    {
        if (!this._usersHello[data.username])
        {
            this._usersHello[data.username] = true;
            var usersC = global.misaka.config.obj.users[data.username.toLowerCase()];
            if (usersC && usersC.hello)
                client.sendMessage(this.getString(usersC.hello, data.username));
            else
                client.sendMessage(this.getString(this.C.messages, data.username));
        }
    }
}

HelloModule.prototype.getString = function(c, user)
{
    if (!c || !c.length)
        return ;
    var str;
    if (c instanceof Array)
    {
        var index = Math.min(Math.floor(Math.random() * c.length), c.length - 1);
        str = c[index];
    }
    else
        str = c;
    if (user)
    {
        var userC = global.misaka.config.obj.users[user.toLowerCase()];
        if (userC && userC.alias)
            user = userC.alias;
        str = str.replace(/\$user/g, user);
    }
    return str;
};

HelloModule.prototype.replaceUser = function(c)
{
    if (!c || !c.length)
        return ;
    if (c instanceof Array)
    {
        var index = Math.min(Math.floor(Math.random() * c.length), c.length - 1);
        return c[index];
    }
    else
        return c;
};

module.exports = HelloModule;
