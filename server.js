var http = require('http'),
    static = require('send'),
    socketio = require('socket.io'),
    rest = require('restler');

var handler = function(request, response) {
    static(request, request.url).root('html').pipe(response);
};

var app = http.createServer(handler),
    io = socketio.listen(app);

var state = {
    instruments: {
        EUR_USD: {
                candles: {},
                chat: {}
            },
        USD_CAD: {
                candles: {},
                chat: {}
            }
        }
};

var usernames = {};
io.sockets.on('connection', function(socket) {
    socket.emit('snapshot', state);

    // when the client emits 'sendchat', this listens and executes
    socket.on('sendchat', function (data) {
        // we tell the client to execute 'updatechat' with 2 parameters
        io.sockets.in(socket.room).emit('updatechat', socket.username, data);

        // cache the chat
        var now = new Date().getTime();
//        state.chat[now] = {chat: {username: socket.username, text: data}};
    });

    // when the client emits 'adduser', this listens and executes
    socket.on('adduser', function(room, username){
        socket.join(room);

        // we store the username in the socket session for this client
        socket.username = username;
        socket.room = room;

        // add the client's username to the room list
        if (!usernames[room])
            usernames[room] = {};
        usernames[room][username] = username;

        // echo to client they've connected
        socket.emit('updatechat', 'SERVER', 'you have connected');
        // echo globally (all clients) that a person has connected
        socket.broadcast.to(room).emit('updatechat', 'SERVER', username + ' has connected');
        // update the list of users in chat, client-side
        io.sockets.in(room).emit('updateusers', usernames[room]);

        // cache the chat
        var now = new Date().getTime();
//        state.chat[now] = {connect: {username: socket.username}};
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', function(){
        socket.leave(socket.room);

console.log('disconenct', socket.room, socket.username);
        // remove the username from global usernames list
        delete usernames[socket.room][socket.username];
        // update list of users in chat, client-side
        io.sockets.emit('updateusers', usernames[socket.room]);
        // echo globally that this client has left
        socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', socket.username + ' has disconnected');

        // cache the chat
        var now = new Date().getTime();
//        state.chat[now] = {disconnect: {username: socket.username}};
    });
});

app.listen(8000);


var host = 'http://fxgame-rates.oanda.com';
var sessionId;
var data = {
    candles: [
            {
                instrument: "USD_CAD",
                granularity: "H1",
//                start: 1352477550
//                start: 1352498405
                start: 1352490000
            }
        ]
    };


var poll = function() {
        rest.get(host + '/v1/instruments/poll?sessionId=' + sessionId)
            .on('complete', function(data, response) {
                console.log(data);
                var c = data.candles;

                if (c) {
                    for (var i = 0, l1 = c.length; i < l1; i++) {
                        var next = c[i];

                        var instrument = next.instrument,
                            granularity = next.granularity;
                        console.log(instrument, granularity);

                        if (!state.candles[instrument]) {
                            state.candles[instrument] = {};
                        }
                        if (!state.candles[instrument][granularity]) {
                            state.candles[instrument][granularity] = {};
                        }
                        for (var j = 0, l2 = next.candles.length; j < l2; j++) {
                            var candle = next.candles[j];
                            state.candles[instrument][granularity][candle.time] = candle;
                        }
                    }
                }
            });

//    setTimeout(poll, 5000);
};

rest.postJson(host + '/v1/instruments/poll', data)
    .on('complete', function(data, response) {
        console.log(response.rawEncoded);
        console.log(data.sessionId);

        sessionId = data.sessionId;

//        poll();
    });
