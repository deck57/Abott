// WARNING: This code should get me banned from the coder guild.

function AutokickModule() {
    this.C = global.misaka.config.obj.modules.Autokick;
    this.info = {
        name: 'Autokick',
        description: 'Kick users based on message patterns',
        commands: [
          { name: 'autokickstart', callback: AutokickModule.prototype.onStart.bind(this) },
          { name: 'startautokick', callback: AutokickModule.prototype.onStart.bind(this) },
          { name: 'autokickend', callback: AutokickModule.prototype.onEnd.bind(this) },
          { name: 'endautokick', callback: AutokickModule.prototype.onEnd.bind(this) },
        ],
        callbacks: { 'join': AutokickModule.prototype.onJoin.bind(this) },
        master: true,
        chatVersions: 7,
        cooldown: this.C.userCommandCooldown,
    };

    this._started = this.C.enable;
    this._userMessages = {};
    for (var name in global.misaka.config.obj.users)
        if (global.misaka.config.obj.users[name].autokick)
            this._userMessages[name.toLowerCase()] = this.initializeMessages(global.misaka.config.obj.users[name].autokick);
    this._messages = this.initializeMessages(this.C.messages);
}

AutokickModule.prototype.initializeMessages = function(messages)
{
    var keyRegex = /^\/(.*)\/([a-zA-Z]*)$/;
    var result = [];

    for (var i = 0; i < messages.length; ++i)
        for (var key in messages[i])
            if (key != "random" && key != "cooldown")
            {
                var keyResult = keyRegex.exec(key);
                if (keyResult.length >= 3)
                {
                    var cooldown = (messages[i].cooldown || messages[i].cooldown === 0) ? messages[i].cooldown : this.C.cooldown;
                    result.push({
                        regex: new RegExp(keyResult[1], keyResult[2]),
                        answers: messages[i][key],
                        answersUsed: [],
                        answersUnused: [],
                        random: messages[i].random || false,
                        cooldown: cooldown * 1000,
                        lastUse: -1,
                    });
                }
                break;
            }
    return result;
}

AutokickModule.prototype.onJoin = function(data)
{
    var self = this;
    var client = global.misaka.getBot().getClient();
    client.getSocket().on('userMsg', function(data) { if (!data.history) { self.onMessage(data); }});
};

AutokickModule.prototype.onStart = function(data)
{
    this._started = true;
    return this.getString(this.C.module_start_message);
};

AutokickModule.prototype.onEnd = function(data)
{
    this._started = false;
    return this.getString(this.C.module_end_message);
};

AutokickModule.prototype.onMessage = function(data)
{
    var client = global.misaka.getBot().getClient();

    if (this._started && data.username != global.misaka.config.obj.username)
    {
        var message;
        if (this._userMessages[data.username.toLowerCase()])
            message = this.testMessages(data, this._userMessages[data.username.toLowerCase()]);
        if (!message)
            message = this.testMessages(data, this._messages);
        if (!message)
            return ;
        var answer = this.answer(data, message);
        var self = this;
        if (answer)
            setTimeout(function () { self.send(answer); }, self.C.kick_message_delay * 1000 || 0);
        setTimeout(function () { client.kick(data.username); }, self.C.kick_command_delay * 1000 || 0);
    }
};

AutokickModule.prototype.testMessages = function(data, messages)
{
    for (var i = 0; i < messages.length; ++i)
        if (messages[i].regex.test(data.msg) && messages[i].lastUse < new Date().getTime() - messages[i].cooldown)
            return messages[i];
}

AutokickModule.prototype.answer = function(data, message)
{
    var answer;
    message.lastUse = new Date().getTime();
    if (message.random)
        answer = this.randomElement(message.answers);
    else
    {
        if (message.answersUnused.length == 0)
        {
            var lastUsed = (message.answersUsed.length && message.answers.length > 1 ? message.answersUsed[message.answersUsed.length - 1] : -1);
            message.answersUsed = [];
            message.answersUnused = [];
            for (var i = 0; i < message.answers.length; ++i)
                if (i != lastUsed)
                    message.answersUnused.push(i);
            if (lastUsed >= 0)
                message.answersUsed.push(lastUsed);
        }
        var index = this.randomElement(message.answersUnused);
        message.answersUnused.splice(message.answersUnused.indexOf(index), 1);
        message.answersUsed.push(index);
        answer = message.answers[index];
    }
    answer = this.getString(answer, data.username);
    var result = message.regex.exec(data.msg);
    for (var i = 1; i < result.length; ++i)
        answer = answer.replace(new RegExp('%' + i, 'g'), result[i]);
    return answer;
};

AutokickModule.prototype.getString = function(c, user)
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

AutokickModule.prototype.replaceUser = function(str, user)
{
    var userC = global.misaka.config.obj.users[user.toLowerCase()];
    if (userC && userC.alias)
        user = this.getString(userC.alias);
    return str.replace(/%user/g, user);
};

AutokickModule.prototype.randomElement = function(array)
{
    return array[Math.min(Math.floor(Math.random() * array.length), array.length - 1)];
};

AutokickModule.prototype.send = function(message)
{
    global.misaka.send(global.misaka.config.obj.room, message);
};

module.exports = AutokickModule;
