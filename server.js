var http = require('http'),
    static = require('send'),
    socketio = require('socket.io'),
    rest = require('restler'),
    qs = require('querystring'),
    gravatar = require('gravatar');

var handler = function(request, response) {
    console.log(request.url);
    if (request.url === "/auth/login") {
        if (request.method === 'POST') {
            var data = '';
            request.on('data', function(fragment) {
                data += fragment;
            });
            request.on('end', function() {
                var post = qs.parse(data);

                rest.postJson('https://verifier.login.persona.org/verify', {
                    assertion: post.assertion,
                    audience: 'http://awesome.oosterveld.org:8000'
                })
                .on('complete', function(data, res) {
                    console.log(data);

                    response.writeHead(200, {'Content-Type': 'application/json'});
                    response.end(JSON.stringify({
                        username: data.email,
                        gravatar: gravatar.url(data.email, {size: 16})
                    }));
                });
            });
        }
//        rest.post('https://

//        response.writeHead(200, {'Content-Type': 'application/json'});
//        response.end(JSON.stringify({
//            a: 'a', 
//            b: 'b'
//        }));
    } else if (request.url === "/auth/logout") {
        if (request.method === 'POST') {
            request.on('end', function() {
                response.writeHead(200);
                response.end();
            });
        }
    } else {
        static(request, request.url).root('html').pipe(response);
    }
};

var app = http.createServer(handler),
    io = socketio.listen(app);

var rooms = {};
var cache = {};

function newRoom() {
    return {
            usernames: {},
            candles: {},
            chat: {}
        };
}

var usernames = {};
io.sockets.on('connection', function(socket) {

    // when the client emits 'sendchat', this listens and executes
    socket.on('sendchat', function (data) {
        // we tell the client to execute 'updatechat' with 2 parameters
        io.sockets.in(socket.room).emit('updatechat', socket.username, data);

        // cache the chat
        var now = new Date().getTime();
//        state.chat[now] = {chat: {username: socket.username, text: data}};
    });

    socket.on('join', function(room) {
console.log('---------------------------');
        socket.room = room;
        socket.join(room);

        socket.emit('snapshot', rooms[room]);
    });

    // when the client emits 'adduser', this listens and executes
    socket.on('adduser', function(username){
console.log('---------------------------');
        // we store the username in the socket session for this client
        socket.username = username;

        // add the client's username to the room list
        if (!rooms[socket.room])
            rooms[socket.room] = newRoom();
        rooms[socket.room].usernames[username] = username;

        // echo to client they've connected
        socket.emit('updatechat', 'SERVER', 'you have connected');
        // echo globally (all clients) that a person has connected
        socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', username + ' has connected');
        // update the list of users in chat, client-side
        io.sockets.in(socket.room).emit('updateusers', rooms[socket.room].usernames);

        // cache the chat
        var now = new Date().getTime();
        rooms[socket.room].chat[now] = {connect: {username: socket.username}};
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', function(){

console.log('disconenct', socket.room, socket.username);
        // remove the username from global usernames list
        if (socket.room) {
            socket.leave(socket.room);

            if (socket.username) {
                delete rooms[socket.room].usernames[socket.username];

                // update list of users in chat, client-side
                io.sockets.emit('updateusers', rooms[socket.room].usernames);

                // echo globally that this client has left
                socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', socket.username + ' has disconnected');

                // cache the chat
                var now = new Date().getTime();
                rooms[socket.room].chat[now] = {disconnect: {username: socket.username}};
            }
        }
    });
});

app.listen(8000);


var host = 'http://fxgame-rates.oanda.com';
var sessionId;
var data = {
    candles: [
            {
                instrument: "USD_CAD",
                granularity: "S5",
//                start: 1352498405
                start: 1352477550
            }
        ]
    };

var last;
var keys;
function setupCandles() {
    keys = Object.keys(cache['USD_CAD'].candles['S5']);

    if (!rooms['USD_CAD'])
        rooms['USD_CAD'] = newRoom();
    if (!rooms['USD_CAD'].candles['S5'])
        rooms['USD_CAD'].candles['S5'] = {};

    for (last = 0; last < 200 && last < keys.length; last++) {
        var index = keys[last];
        var candle = cache['USD_CAD'].candles['S5'][index];
        rooms['USD_CAD'].candles['S5'][index] = candle;
    }
};

function trickle() {
    if (last < keys.length) {
        var index = keys[last++];

        var index = keys[last];
        var candle = cache['USD_CAD'].candles['S5'][index];
        rooms['USD_CAD'].candles['S5'][index] = candle;

        io.sockets.in('USD_CAD').emit('candle', candle);

        setTimeout(trickle, 5000);
    }
};

var poll = function() {
    rest.get(host + '/v1/instruments/poll?sessionId=' + sessionId)
        .on('complete', function(data, response) {
            console.log(data);
            var candles = data.candles;

            if (candles) {
                for (var i = 0, l1 = candles.length; i < l1; i++) {
                    var next = candles[i];

                    var instrument = next.instrument,
                        interval = next.granularity;

                    if (!cache[instrument])
                        cache[instrument] = newRoom();
                    if (!cache[instrument].candles[interval])
                        cache[instrument].candles[interval] = {};
                    for (var j = 0, l2 = next.candles.length; j < l2; j++) {
                        var candle = next.candles[j];
                        cache[instrument].candles[interval][candle.time] = candle;
                    }
                }
            }
//            console.log(cache);

            setupCandles();
            trickle();
//            setTimeout(poll, 5000);
        });
};

var now = Math.floor(new Date().getTime() / 1000);
var then = now - (1 * 24 * 60 * 60); // 2 DAYS AGO
then = Math.floor(then / 10) * 10; // round to nearest 10 seconds

data.candles[0].start = then;
/*
rest.postJson(host + '/v1/instruments/poll', data)
    .on('complete', function(data, response) {
        console.log(response.rawEncoded);
        console.log(data.sessionId);

        sessionId = data.sessionId;

        poll();
    });
*/
