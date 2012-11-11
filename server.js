var http = require('http'),
    static = require('send'),
    socketio = require('socket.io'),
    rest = require('restler'),
    qs = require('querystring'),
    gravatar = require('gravatar'),
    async = require('async'),
    nano = require('nano')('http://nodejitsudb1638891429.iriscouch.com:5984');

var handler = function(request, response) {
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

function newRoom(instrument) {
    var room = {
            instrument: instrument,
            db_name: instrument.toLowerCase(),
            usernames: {},
            candles: {},
            chat: {}
        };

    fetchChat(room);

    return room;
}

function fetchChat(room) {

    if (!dbs[room.db_name])
        dbs[room.db_name] = nano.use(room.db_name);

    dbs[room.db_name].list({descending: true}, function(err, data) {
        if (!err) {
            for (var i = 0; i < data.total_rows; i++) {
                dbs[room.db_name].get(data.rows[i].key, function(err, data) {
                    if (!data.username || !data.text || !data.gravatar) {
                        console.log(room.instrument, 'bad data', data);
                    } else if (data.username !== "SERVER") {
                        data.timestamp = data.timestamp;
                        room.chat[data.timestamp] = data;
                    }
                });
            }
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
            rooms[socket.room].chat[now] = update;
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
        update.timestamp = update.timestamp;
        socket.emit('updatechat', update);

        update.text = username + ' has connected';
        // echo globally (all clients) that a person has connected
        socket.broadcast.to(room).emit('updatechat', update);

        // cache the chat
//        rooms[room].chat[now] = update;
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
//        rooms[socket.room].chat[now] = update;
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

function parsePollResponse(data, response) {
    if (data.candles) {
        for (var i in data.candles) {
            var next = data.candles[i];

            var room = rooms[next.instrument];
            var interval = room.candles[next.granularity];

            for (var j in next.candles) {
                var candle = next.candles[j];
                if (!interval[candle.time]) {
                    io.sockets.in(next.instrument).emit('candle', candle);
                    interval[candle.time] = candle;
                }
            }

            trimCandles(next.instrument);
        }
    } else {
        console.log('hack!!!!');
        var now = Math.floor(new Date().getTime() / 1000);
        now = (Math.floor(now / 5)) * 5;

        var candle = {
                time: now,
                "open mid": 1.27029,
                "close mid": 1.27029,
                "high mid": 1.27039,
                "low mid": 1.27019,
                "complete": true
            };

        rooms['EUR_USD'].candles['S5'][now] = candle;
        io.sockets.in('EUR_USD').emit('candle', candle);

        trimCandles('EUR_USD');

        var candle = {
                time: now,
                "open mid": 1.00029,
                "close mid": 1.00029,
                "high mid": 1.00039,
                "low mid": 1.00019,
                "complete": true
            };

        rooms['USD_CAD'].candles['S5'][now] = candle;
        io.sockets.in('USD_CAD').emit('candle', candle);

        trimCandles('USD_CAD');
    }
}

function trimCandles(instrument) {
    var candles = rooms[instrument].candles['S5'];
    var keys = Object.keys(candles);
    if (keys.length > 2000) {
        keys.sort();
        delete candles[keys[0]];
    }
}

function poll() {
    rest.get(host + '/v1/instruments/poll?sessionId=' + sessionId)
        .on('complete', function(data, response) {
            parsePollResponse(data, response);
            setTimeout(poll, 5000);
        });
}

var instruments = ["USD_CAD", "EUR_USD"];

function fetchCandles(instrument, callback) {
    rest.get(host + "/v1/instruments/" + instrument +
            "/candles?gran=S5&count=500")
        .on('complete', function(data, response) {
            var room = rooms[data.instrument] = newRoom(data.instrument);
            var interval = room.candles[data.granularity] = {};
            var last = 0;

            for (var i in data.candles) {
                var candle = data.candles[i];
                interval[candle.time] = candle;

                if (candle.time > last)
                    last = candle.time;
            }
/*
            var now = Math.floor(new Date().getTime() / 1000);
            for (var next = last + 5; next < now; next += 5) {
console.log('adding', instrument, next);
                interval[next] = {
                        time: next,
                        "open mid": interval[last]["open mid"],
                        "close mid": interval[last]["close mid"],
                        "high mid": interval[last]["high mid"],
                        "low mid": interval[last]["low mid"],
                        "complete": true
                    };
            }
*/
            callback(null, {instrument: instrument,
                            time: last});
        });
}

function setupPolling(timestamps) {
    var request = { candles: [] };
    for (var index in timestamps) {
        var next = timestamps[index];
        request.candles.push({
                instrument: next.instrument,
                granularity: 'S5',
                start: next.time
            });
    }

    rest.postJson(host + '/v1/instruments/poll', request)
        .on('complete', function(data, response) {
            sessionId = data.sessionId;
            poll();
        });
}

async.map(instruments, fetchCandles,
    function(err, results) {
        setupPolling(results);
    }
);
