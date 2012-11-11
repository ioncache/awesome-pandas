var connected = false;
var routed = false;
var room;

var socket = io.connect(location.origin);
var series_data = [];
var currency_pairs = [ "EUR_USD", "USD_CAD" ];

$(document).ready(function() {
/*
    $.ajax({
        type: "GET",
        url: "/config",
        success: function(response, status, xhr) {
            console.log(response);
        }});
*/
    // make currency pair dropdown
    var currency_dropdown = $("#currency_dropdown");
    for ( var i in currency_pairs ) {
        var new_pair = $("<li />");
        $("<a />")
            .attr("tabindex", "-1")
            .attr("href", "#/charts/" +  currency_pairs[i])
            .text(currency_pairs[i].replace("_", "/"))
        .appendTo(new_pair);
        
        new_pair.appendTo(currency_dropdown);
    }

    // Click Events
    $("#signin").click(function(e) {
        navigator.id.request();
        e.preventDefault();
    });

    $("#signout").click(function(e) {
        navigator.id.logout();
        e.preventDefault();
    });

    $('#send_message').click(function() {
        var message = $("#message").val();
        $("#message").val("");
        // tell server to execute 'sendchat' and send along one parameter
        socket.emit("sendchat", {
            message: message,
            prediction: $("#predict_rise").hasClass("active") ? 1 : $("#predict_fall").hasClass("active") ? -1 : 0
        });
        $("#message").focus();
    });

    // when the client hits ENTER on their keyboard
    $("#message").keypress(function(e) {
        if (e.which == 13) {
            $(this).blur();
            $("#send_message").focus().click();
        }
    });

    // enable some button functionality
    $("#prediction_buttons").on("click", "button", function() {
        var show = $(this).hasClass("active") ? 0 : 1;
        $("#prediction_buttons button").removeClass("active");
        if (show) {
            $(this).addClass("active");
        }
    });

    // enable tooltips
    $(".tool_tip").tooltip({
        placement: "bottom"
    });

    // Persona Auth setup
    navigator.id.watch({
        loggedInUser: null,
        onlogin: function(assertion) {
            $.ajax({
                type: "POST",
                url: "/auth/login",
                data: {
                    assertion: assertion
                },
                success: function(response, status, xhr) {
                    gravatar = response.gravatar;
                    username = response.username;

                    $("#signin").fadeOut(200, function() {
                        $("#signout").fadeIn(200);
                    });
                    $("#message, #send_message").each(function(i, e) {
                        $(e).removeAttr("disabled");
                    });
                    socket.emit("adduser", username);
                },
                error: function(xhr, status, error) {
                    console.log(xhr, status, error);
                }
            });
        },
        onlogout: function() {
            $.ajax({
                type: "POST",
                url: "/auth/logout",
                success: function(response, status, xhr) {
                    $("#signout").fadeOut(200, function() {
                        $("#signin").fadeIn(200);
                    });

                    $("#message, #send_message").each(function(i, e) {
                        $(e).attr("disabled", true);
                    });
                    socket.emit("removeuser", {});
                },
                error: function(xhr, status, error) {
                    console.log(xhr, status, error);
                }
            });
        }
    });

    // socket.io methods

    // on connection to server, ask for user's name with an anonymous callback
    socket.on('connect', function() {
        connected = true;
console.log('connect', room, connected, routed);
        if (routed && room)
            socket.emit('join', room);
    });

    // gets an initial snapshot of the chat and some historical data for the currency pair
    // sets up the chart with data feed and messages
    socket.on('snapshot', function(data) {
console.log('snapshot', data);
        var messages = [];
        var chat = data.chat;
        for (var key in chat) {
            messages.push([key,
            {
                timestamp: key,
                username: chat[key].username,
                text: chat[key].text,
                gravatar: chat[key].gravatar
            }]);
        }
        var message_flags = [];
        for (var i in messages) {
            var title_symbol = String.fromCharCode(8226);
            if (messages[i][1].username != 'SERVER')
                message_flags.push({
                   x: (new Date(0)).setMilliseconds(messages[i][0]),
                   title: title_symbol,
                   text: '<img src="' + messages[i][1].gravatar + '?size=16" />' + messages[i][1].username + " said at:<br />" + messages[i][1].text
                });
        }
        messages.sort(function(a, b) {
            a = a[0];
            b = b[0];
            return a < b ? -1 : (a > b ? 1 : 0);
        });
        $("#chat_container").empty();
        $.each(messages, function(i, e) {
            new_chat_message(e[1]);
        });

        series_data = [];
        $.each(data.candles.S5, function(i, e) {
            series_data.push([e.time * 1000, e['open mid'], e['high mid'], e['low mid'], e['close mid']]);
        });
        // create the chart
        chart = new Highcharts.StockChart({
            chart: {
                renderTo: "chart_container"
            },

            plotOptions: {
                candlestick: {
                    color: "#BD362F",
                    upColor: "#5BB75B"
                }
            },

            rangeSelector: {
                buttons: [{
                    type: "minute",
                    count: 10,
                    text: "10m"
                }, {
                    type: "hour",
                    count: 1,
                    text: "1h"
                }, {
                    type: "hour",
                    count: 6,
                    text: "6h"
                }, {
                    type: "day",
                    count: 1,
                    text: "1d"
                }, {
                    type: "week",
                    count: 1,
                    text: "1w"
                }, {
                    type: "all",
                    count: 1,
                    text: "All"
                }],
                selected: 1,
                inputEnabled: false
            },

            series: [{
                name: room.replace("_", "/"),
                type: "candlestick",
                data: series_data,
                id: "candlesticks"
            }, {
                name: "Message History",
                type: "flags",
                data: message_flags,
				onSeries : "candlesticks",
				shape : "circlepin",
				width : 12
            }]
        });
    });

    // new curnecy candles are added to the chart
    socket.on('candle', function(data) {
console.log('candle', data);
      if (data) {
        var new_point = [data.time * 1000, data['open mid'], data['high mid'], data['low mid'], data['close mid']];
        if (chart && chart.series)
            chart.series[0].addPoint(new_point, true, true);
      }
    });

    // listener, whenever the server emits 'updatechat', this updates the chat body
    socket.on('updatechat', function(data) {
        new_chat_message(data);
    });

    // listener, whenever the server emits 'updateusers', this updates the username list
    socket.on('updateusers', function(data) {
        $("#users").empty();
        $.each(data, function(key, value) {
            var new_message = $("<div />").addClass("label label-info").css({
                "display": "block",
                "margin": ".35em 0"
            }).html(key.replace(/^(\w*)@.*$/, "$1")).appendTo("#users");
        });
    });

    // TODO: add router, Sammy or Backbone
    router = Sammy(function() {
        this.get('#/charts/:room', function() {
            console.log(room, this.params['room']);
            room = this.params['room'];
            routed = true;

            $('#chat_about_title')
                .text('Chat about ' + room.replace("_", "/"))

console.log('sammy', room, connected, routed);
            if (connected && room)
                socket.emit('join', room);
        });
        this.get(/(\/|\#\/)/, function(context) {
            console.log('default');
            context.redirect('#/charts/USD_CAD');
        });
    });
    router.run(); 
});

// adds a new message to the chat area
function new_chat_message(data) {
    if (!data.username || !data.timestamp || !data.gravatar)
        return;

    var message_class = "alert-chat-message-" + ($("#chat_container").children().length % 2 ? "even" : "odd");
    var time = new Date(0);
    time.setMilliseconds(data.timestamp);
    if (typeof(data.username) == "undefined") {
        data.username = "unknown";
    }
    $("<div />").addClass("alert " + message_class).css({
        "margin-bottom": "0.65em"
    }).html("<img src=\"" + data.gravatar + "?size=16\" />&nbsp;&nbsp;<strong>[" + time.toUTCString() + "] " + data.username.replace(/^(\w*)@.*$/, "$1") + ":</strong>&nbsp;&nbsp;" + data.text).prependTo("#chat_container");
}

// simple view switcher
function show_view(view) {
    $(".view").fadeOut(200);
    $(".menu_item").removeClass("active");
    setTimeout(function() {
        $("#" + view).fadeIn(200);
        $("#" + view + "_page").addClass('active');
    }, 200);
}
