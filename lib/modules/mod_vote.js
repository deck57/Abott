// WARNING: This code should get me banned from the coder guild.

function VoteModule() {
    this.C = global.misaka.config.obj.modules.Vote;

    this.info = {
        name: 'Vote',
        description: 'Simple vote system',
        commands: [
          { name: 'votestart', callback: VoteModule.prototype.onStart.bind(this) },
          { name: 'startvote', callback: VoteModule.prototype.onStart.bind(this) },
          { name: 'voteinfo', callback: VoteModule.prototype.onInfo.bind(this) },
          { name: 'infovote', callback: VoteModule.prototype.onInfo.bind(this) },
          { name: 'votestate', callback: VoteModule.prototype.onState.bind(this) },
          { name: 'statevote', callback: VoteModule.prototype.onState.bind(this) },
          { name: 'voteend', callback: VoteModule.prototype.onEnd.bind(this) },
          { name: 'endvote', callback: VoteModule.prototype.onEnd.bind(this) },
        ],
        callbacks: { 'join': VoteModule.prototype.onJoin.bind(this) },
        cooldown: this.C.userCommandCooldown,
    };

    this._started = false;
    this._votes = {};
    this._options = [];
    this._optionsId = {};
    this._lastVoteInfo = -1;
    this._lastVoteState = -1;
    var self = this;
}

VoteModule.prototype.onJoin = function(data)
{
    var client = global.misaka.getBot().getClient();
    var self = this;
    client.getSocket().on('userMsg', function(data) { if (!data.history) { self.onMessage(data); }});
};

VoteModule.prototype.onStart = function(data)
{
    if (data.sender != global.misaka.config.obj.master)
        return ;
    if (this._started)
        return this.C.votestart.vote_already_started;
    this._votes = {};
    this._options = JSON.parse(JSON.stringify(data.parsed.tailArray));
    this._optionsId = {};
    for (var i = 0; i < this._options.length; ++i)
        this._optionsId[this._options[i].toLowerCase()] = i;
    if (!this._options.length)
        return this.getString(this.C.votestart.no_options);
    this._started = true;
    return this.getString(this.C.votestart.message).replace(/%options/g, this._options.join(", "));
};

VoteModule.prototype.onInfo = function(data)
{
    if (data.sender != global.misaka.config.obj.master && (!this.C.voteinfo.user || this._lastVoteInfo > new Date().getTime() - this.C.voteinfo.cooldown * 1000))
        return ;
    this._lastVoteInfo = new Date().getTime();
    if (!this._started)
        return this.C.voteinfo.no_vote_started;
    return this.getString(this.C.voteinfo.message).replace(/%options/g, this._options.join(", "));
};

VoteModule.prototype.onState = function(data)
{
    if (data.sender != global.misaka.config.obj.master && (!this.C.votestate.user || this._lastVoteState > new Date().getTime() - this.C.votestate.cooldown * 1000))
        return ;
    this._lastVoteState = new Date().getTime();
    if (!this._started)
        return this.C.votestate.no_vote_started;
    var votes = [];
    for (var n in this._votes)
        votes[this._votes[n]] = (votes[this._votes[n]] || 0) + 1;
    var state = [];
    for (var n in votes)
        state.push(this._options[n] + ":" + votes[n]);
    if (this.C.votestate.display_empty_options)
        for (var i = 0; i < this._options.length; ++i)
            if (votes[i] === undefined)
                state.push(this._options[i] + ":0");
    if (!state.length)
        return this.C.votestate.no_vote_yet;
    return this.getString(this.C.votestate.message).replace(/%state/g, state.join(", "));
};

VoteModule.prototype.onEnd = function(data)
{
    if (data.sender != global.misaka.config.obj.master)
        return ;
    if (!this._started)
        return this.C.voteend.no_vote_started;
    this._started = false;
    var votes = {};
    for (var n in this._votes)
        votes[this._votes[n]] = (votes[this._votes[n]] || 0) + 1;
    var numVotes = 0;
    var winners = [];
    for (var n in votes)
    {
        if (votes[n] == numVotes)
            winners.push(this._options[n]);
        else if (votes[n] > numVotes)
            winners = [this._options[n]];
        numVotes = Math.max(votes[n], numVotes);
    }
    if (!winners.length)
        return this.C.voteend.nobody_voted;
    if (winners.length == 1)
        return this.getString(this.C.voteend.message).replace(/%result/g, winners[0]);
    else if (winners.length > 1)
        return this.getString(this.C.voteend.message_draw).replace(/%result/g, winners.join(", "));
};

VoteModule.prototype.onMessage = function(data)
{
    var client = global.misaka.getBot().getClient();

    if (this._started && data.msg.trim()[0] == '#' && data.username != global.misaka.config.obj.username)
    {
        var option = data.msg.trim().replace('#', '');
        var optionId = this._optionsId[option.toLowerCase()];
        if (optionId === undefined)
            return client.sendMessage(this.getString(this.C.invalid_option, data.username).replace(/%option/g, option));
        if (this._votes[data.username] !== undefined && this._votes[data.username] != optionId && this.C.user_changed_vote && this.C.user_changed_vote.length)
            client.sendMessage(this.getString(this.C.user_changed_vote, data.username).replace(/%option/g, option));
        this._votes[data.username] = optionId;
    }
};

VoteModule.prototype.getString = function(c, user)
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

VoteModule.prototype.replaceUser = function(str, user)
{
    var userC = global.misaka.config.obj.users[user.toLowerCase()];
    if (userC && userC.alias)
        user = this.getString(userC.alias);
    return str.replace(/%user/g, user);
};

VoteModule.prototype.randomElement = function(array)
{
    return array[Math.min(Math.floor(Math.random() * array.length), array.length - 1)];
};

module.exports = VoteModule;
