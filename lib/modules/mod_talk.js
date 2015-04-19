// WARNING: This code should get me banned from the coder guild.

function TalkModule() {
    this.C = global.misaka.config.obj.modules.Talk;
    this.info = {
        name: 'Talk',
        description: 'Talking bot!',
        commands: [
          { name: 'talkstart', callback: TalkModule.prototype.onStart.bind(this) },
          { name: 'talkend', callback: TalkModule.prototype.onEnd.bind(this) },
          { name: 'starttalk', callback: TalkModule.prototype.onStart.bind(this) },
          { name: 'endtalk', callback: TalkModule.prototype.onEnd.bind(this) },
        ],
        callbacks: { 'join': TalkModule.prototype.onJoin.bind(this) },
        master: true,
        cooldown: this.C.userCommandCooldown,
    };

    this._started = this.C.enable;
    this._userMessages = {};
    for (var name in global.misaka.config.obj.users)
        if (global.misaka.config.obj.users[name].talk)
            this._userMessages[name.toLowerCase()] = this.initializeMessages(global.misaka.config.obj.users[name].talk);
    this._messages = this.initializeMessages(this.C.messages);
}

TalkModule.prototype.initializeMessages = function(messages)
{
    var keyRegex = /^\/(.*)\/([a-zA-Z]*)$/;
    var result = [];

    for (var i = 0; i < messages.length; ++i)
        for (var key in messages[i])
            if (key != "random" && key != "cooldown" && key != "priority")
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
                        priority: messages[i].priority || 0,
                        lastUse: -1,
                    });
                }
                break;
            }
    result.sort(function (a, b) { return b.priority - a.priority; });
    return result;
}

TalkModule.prototype.onJoin = function(data)
{
    var self = this;
    var client = global.misaka.getBot().getClient();
    client.getSocket().on('userMsg', function(data) { if (!data.history) { self.onMessage(data); }});
};

TalkModule.prototype.onStart = function(data)
{
    this._started = true;
    return this.getString(this.C.module_start_message, data.sender);
};

TalkModule.prototype.onEnd = function(data)
{
    this._started = false;
    return this.getString(this.C.module_end_message, data.sender);
};

TalkModule.prototype.onMessage = function(data)
{
    var client = global.misaka.getBot().getClient();

    if (this._started && data.username != global.misaka.config.obj.username)
    {
        var messages = [];
        if (this._userMessages[data.username.toLowerCase()])
            messages = this.testMessages(data, this._userMessages[data.username.toLowerCase()]);
        if (!messages.length)
            messages = this.testMessages(data, this._messages);
        if (!messages.length)
            return ;
        var answer = this.answer(data, this.randomElement(messages));
        this.send(answer);
    }
};

TalkModule.prototype.testMessages = function(data, messages)
{
    var messagesFound = [];
    var priority = -999999;

    for (var i = 0; i < messages.length; ++i)
        if (messages[i].regex.test(data.msg) && messages[i].lastUse < new Date().getTime() - messages[i].cooldown)
        {
            priority = Math.max(priority, messages[i].priority);
            if (priority > messages[i].priority)
                break;
            messagesFound.push(messages[i]);
        }
    return messagesFound;
}

TalkModule.prototype.answer = function(data, message)
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

TalkModule.prototype.getString = function(c, user)
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

TalkModule.prototype.replaceUser = function(str, user)
{
    var userC = global.misaka.config.obj.users[user.toLowerCase()];
    if (userC && userC.alias)
        user = this.getString(userC.alias);
    return str.replace(/%user/g, user);
};

TalkModule.prototype.randomElement = function(array)
{
    return array[Math.min(Math.floor(Math.random() * array.length), array.length - 1)];
};

TalkModule.prototype.send = function(message)
{
    global.misaka.send(global.misaka.config.obj.room, message);
};

module.exports = TalkModule;
