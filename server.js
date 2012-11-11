var http = require('http'),
    static = require('send'),
    socketio = require('socket.io'),
    rest = require('restler'),
    qs = require('querystring'),
    gravatar = require('gravatar'),
    nano = require('nano')('http://nodejitsudb1638891429.iriscouch.com:5984');

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
                    // FIXME: THis should be a configuration varaible
                    audience: request.headers.host
                })
                .on('complete', function(data, res) {
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

var dbs = {};
var rooms = {};
var cache = {};

function newRoom(instrument) {
    var room = {
            instrument: instrument,
            db_name: instrument.toLowerCase(),
            usernames: {},
            candles: {},
            chat: {}
        };

    return room;
}

function fetchChat(instrument) {
    var room = rooms[instrument];

    if (!dbs[room.db_name])
        dbs[room.db_name] = nano.use(room.db_name);

    dbs[room.db_name].list({descending: true}, function(err, data) {
      if (!err)
        for (var i = 0; i < data.total_rows; i++) {
            dbs[room.db_name].get(data.rows[i].key, function(err, data) {
                if (!data.username || !data.text || !data.gravatar) {
                    console.log(instrument, 'bad data', data);
                } else {
                    data.timestamp = data.timestamp - (2 * 24 * 60 * 60 * 1000) + (3 * 60 * 60 * 1000);
                    room.chat[data.timestamp] = data;
                }
            });
        }
    });
}

function insert_doc(db, db_name, doc, tried) {
    db.insert(doc, function (error,http_body,http_headers) {
        if(error) {
            if(error.message === 'no_db_file'  && tried < 1) {
                // create database and retry
                return nano.db.create(db_name, function () {
                    insert_doc(db, db_name, doc, tried+1);
                });
            } else { return console.log(error); }
        }
    });
}

function updateDatabase(room, update) {
    var db_name = room.toLowerCase();
    if (!dbs[room])
        dbs[room] = nano.use(db_name);

    insert_doc(dbs[room], db_name, update, 0);
}

var usernames = {};
io.sockets.on('connection', function(socket) {

    socket.on('sendchat', function (data) {
        if (socket.room && socket.username) {
            var now = new Date().getTime(),
                update = {
                    username: socket.username,
                    text: data.message,
                    prediction: data.prediction,
                    timestamp: now,
                    gravatar: socket.gravatar
                };

            io.sockets.in(socket.room).emit('updatechat', update);

            // cache the chat
            rooms[socket.room].chat[now] = {chat: update};
            updateDatabase(socket.room, update);
        }
    });

    socket.on('join', function(room) {
        if (socket.room) {
            socket.leave(socket.room);
            if (socket.username) {
                removeUser(socket.room, socket.username);
            }
        }

        socket.room = room;
        socket.join(room);

        if (socket.username) {
            addUser(room, socket.username);
        }

        socket.emit('snapshot', rooms[room]);
    });

    socket.on('removeuser', function(data) {
        if (socket.room && socket.username) {
            var now = new Date().getTime();
            var update = {
                    username: 'SERVER',
                    text: 'you have disconnected',
                    timestamp: now,
                    gravatar: socket.gravatar
                };
            // echo to client they've connected
            socket.emit('updatechat', update);

            if (rooms[socket.room].usernames[socket.username]) {
                removeUser(socket.room, socket.username);
            }
        }
    });

    // when the client emits 'adduser', this listens and executes
    socket.on('adduser', function(username){
        if (socket.room) {
            // we store the username in the socket session for this client
            socket.gravatar = gravatar.url(username);
            socket.username = username;

            addUser(socket.room, username);
        }
    });

    function addUser(room, username) {
        // add the client's username to the room list
        if (!rooms[room])
            rooms[room] = newRoom(room);
        rooms[room].usernames[username] = username;

        // update the list of users in chat, client-side
        io.sockets.in(room).emit('updateusers', rooms[room].usernames);

        var now = new Date().getTime();
        var update = {
                username: 'SERVER',
                text: 'you have connected',
                timestamp: now,
                gravatar: socket.gravatar
            };
        // echo to client they've connected
        socket.emit('updatechat', update);

        update.text = username + ' has connected';
        // echo globally (all clients) that a person has connected
        socket.broadcast.to(room).emit('updatechat', update);

        // cache the chat
        rooms[room].chat[now] = {chat: update};
        updateDatabase(room, update);
    }

    function removeUser(room, username) {
        delete rooms[socket.room].usernames[socket.username];

        // update list of users in chat, client-side
        io.sockets.emit('updateusers', rooms[socket.room].usernames);

        var now = new Date().getTime();
        var update = {
            username: 'SERVER',
            text: socket.username + ' has disconencted',
            timestamp: now,
            gravatar: socket.gravatar
        };

        // echo globally that this client has left
        socket.broadcast.to(socket.room).emit('updatechat', update);

        // cache the chat
        rooms[socket.room].chat[now] = {chat: update};
        updateDatabase(socket.room, update);
    }

    // when the user disconnects.. perform this
    socket.on('disconnect', function(){

        // remove the username from global usernames list
        if (socket.room) {
            socket.leave(socket.room);

            if (socket.username &&
                    rooms[socket.room].usernames[socket.username]) {
                removeUser(socket.room, socket.username);
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
        //        start: 1352477550
                start: 1352490000
            },
            {
                instrument: "EUR_USD",
                granularity: "S5",
        //        start: 1352477550
                start: 1352490000
            }
        ]
    };

var last;
var keys;
function setupCandles() {
    keys = Object.keys(cache['EUR_USD'].candles['S5']);

    if (!rooms['EUR_USD'])
        rooms['EUR_USD'] = newRoom('EUR_USD');
    if (!rooms['EUR_USD'].candles['S5'])
        rooms['EUR_USD'].candles['S5'] = {};

    for (last = 0; last < 200 && last < keys.length; last++) {
        var index = keys[last];
        var candle = cache['EUR_USD'].candles['S5'][index];
        rooms['EUR_USD'].candles['S5'][index] = candle;
    }

    fetchChat('EUR_USD');

    keys = Object.keys(cache['USD_CAD'].candles['S5']);

    if (!rooms['USD_CAD'])
        rooms['USD_CAD'] = newRoom('USD_CAD');
    if (!rooms['USD_CAD'].candles['S5'])
        rooms['USD_CAD'].candles['S5'] = {};

    for (last = 0; last < 200 && last < keys.length; last++) {
        var index = keys[last];
        var candle = cache['USD_CAD'].candles['S5'][index];
        rooms['USD_CAD'].candles['S5'][index] = candle;
    }

    fetchChat('USD_CAD');
};

function trickle() {
console.log('trickle', last, keys.length);
    if (last < keys.length) {
        var index = keys[last++];

        var index = keys[last];
        var candle = cache['EUR_USD'].candles['S5'][index];
        if (candle) {
            rooms['EUR_USD'].candles['S5'][index] = candle;
            io.sockets.in('EUR_USD').emit('candle', candle);
        }

        var index = keys[last];
        var candle = cache['USD_CAD'].candles['S5'][index];

        if (candle) {
            rooms['USD_CAD'].candles['S5'][index] = candle;
            io.sockets.in('USD_CAD').emit('candle', candle);
        }

        setTimeout(trickle, 5000);
    }
};

var poll = function() {
    rest.get(host + '/v1/instruments/poll?sessionId=' + sessionId)
        .on('complete', function(data, response) {
            var candles = data.candles;

            if (candles) {
                for (var i = 0, l1 = candles.length; i < l1; i++) {
                    var next = candles[i];

                    var instrument = next.instrument,
                        interval = next.granularity;

                    if (!cache[instrument])
                        cache[instrument] = newRoom(instrument);
                    if (!cache[instrument].candles[interval])
                        cache[instrument].candles[interval] = {};
                    for (var j = 0, l2 = next.candles.length; j < l2; j++) {
                        var candle = next.candles[j];
                        cache[instrument].candles[interval][candle.time] = candle;
                    }
                }
            }

            setupCandles();
            trickle();
//            setTimeout(poll, 5000);
        });
};

var now = Math.floor(new Date().getTime() / 1000);
var then = now - (2 * 24 * 60 * 60); // 2 DAYS AGO
then = Math.floor(then / 10) * 10; // round to nearest 10 seconds

//for (var i = 0; i < data.candles.length; i++) {
//    data.candles[i].start = then;
//}
console.log(data);

//rest.getJson(host + "/v1/

rest.postJson(host + '/v1/instruments/poll', data)
    .on('complete', function(data, response) {
        console.log(response.rawEncoded);
        console.log(data.sessionId);

        sessionId = data.sessionId;

        poll();
    });
