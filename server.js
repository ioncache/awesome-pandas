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
    hello: 'world',
    candles: {},
    chat: {}
};

var nextClient = 1;
var clients = {};
io.sockets.on('connection', function(socket) {
    socket.emit('snapshot', state);
/*
    clients[nextClient] = socket;
    socket.set('clientid', nextClient++, function() {
        socket.emit('snapshot', {'hello': 'world'});
    });

    socket.on('disconnet', function() {
        socket.get('clientid', function(err, clientId) {
            if (!err) {
                delete clients[clientId];
            }
        });
    });
*/
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

        poll();
    });
