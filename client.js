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
                granularity: "S5",
//                start: 1352477550
                start: 1352498405
            }
        ]
    };

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

rest.postJson(host + '/v1/instruments/poll', data, {
        parser: function(data, callback) {
console.log(data);
            var y = data.match(/{"(\w+)":"(\d+)"}/);
            var data = {};
            data[y[1]] = y[2];
            callback(null, data);
        }
    })
    .on('complete', function(data, response) {
        console.log(response.rawEncoded);
        console.log(data.sessionId);

        sessionId = data.sessionId;

        poll();
    });
