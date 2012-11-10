var rest = require('restler');

//var host = 'http://oanda-cs-dev:62300';
var host = 'http://fxgame-rates.oanda.com';

//rest.get(host + '/v1/instruments')
//    .on('complete', function(data) {
//        console.log(data);
//    });


var data = {
    candles: [
            {
                instrument: "USD_CAD",
                granularity: "H1",
                start: 1352490000
//                start: 1352498405
            }
        ]
    };

console.log(data);

var sessionId;

var poll = function() {
        rest.get(host + '/v1/instruments/poll?sessionId=' + sessionId)
            .on('complete', function(data, response) {
                console.log(data);
                var candles = data.candles;

                if (candles)
                    for (var i = 0, len = candles.length; i < len; i++) {
                        var next = candles[i];
                        console.log(next);
                    }
            });

    setTimeout(poll, 5000);
};

rest.postJson(host + '/v1/instruments/poll', data)
    .on('complete', function(data, response) {
        console.log(response.rawEncoded);
        console.log(data.sessionId);

        sessionId = data.sessionId;

        poll();
    });
