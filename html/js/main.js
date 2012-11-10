var room = 'USD_CAD';
var socket = io.connect(location.origin);
var session_id;
var series_data = [];

$(document).ready(function() {
    $("#signin").click(function(e) {
        navigator.id.request();
        e.preventDefault();
    });

    $("#signout").click(function(e) {
        navigator.id.logout();
        e.preventDefault();
    });

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
                },
                error: function(xhr, status, error) {
                    console.log(xhr, status, error);
                }
            });
        }
    });

    // on connection to server, ask for user's name with an anonymous callback
    socket.on('connect', function() {
        socket.emit('join', room);
    });

    socket.on('snapshot', function(data) {
        console.log(data);
        $.each(data.candles.S5, function(i, e) {
            series_data.push([e.time * 1000, e['open mid'], e['high mid'], e['low mid'], e['close mid']]);
        });
        // create the chart
        chart = new Highcharts.StockChart({
            chart: {
                renderTo: 'chart_container'
            },

            rangeSelector: {
                buttons: [{
                    type: 'minute',
                    count: 10,
                    text: '10m'
                }, {
                    type: 'hour',
                    count: 1,
                    text: '1h'
                }, {
                    type: 'hour',
                    count: 6,
                    text: '6h'
                }, {
                    type: 'day',
                    count: 1,
                    text: '1d'
                }, {
                    type: 'week',
                    count: 1,
                    text: '1w'
                }, {
                    type: 'all',
                    count: 1,
                    text: 'All'
                }],
                selected: 1,
                inputEnabled: false
            },

            series: [{
                type: 'candlestick',
                name: room.replace('_', '/'),
                data: series_data
            }]
        });
    });

    socket.on('candle', function(data) {
        var new_point = [data.time * 1000, data['open mid'], data['high mid'], data['low mid'], data['close mid']];
        chart.series[0].addPoint(new_point, true, true);
    });
    // listener, whenever the server emits 'updatechat', this updates the chat body
    socket.on('updatechat', function(data) {
        console.log(data);
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

    $('#send_message').click(function() {
        var message = $("#message").val();
        console.log('message', message);
        $("#message").val("");
        // tell server to execute 'sendchat' and send along one parameter
        socket.emit("sendchat", message);
    });

    // when the client hits ENTER on their keyboard
    $("#message").keypress(function(e) {
        if (e.which == 13) {
            $(this).blur();
            $("#send_message").focus().click();
        }
    });

    // TODO: add router, Sammy or Backbone
    //router = Sammy(function() {
    //    // profile pages
    //    this.get(/\#\/profile\/(.*)/, function() {
    //        var display_name = this.params['splat'];
    //
    //        var profile_promise = get_profile(display_name);
    //
    //        profile_promise.done(function() {
    //            show_view('profile');
    //        });
    //    });
    //
    //    // leaderboard pages
    //    this.get(/\#\/charts\/(\d+)/, function() {
    //        var currency_pair = this.params['splat'];
    //        show_view('chart');
    //    });
    //
    //});
    //router.run(); 
});

function new_chat_message(data) {
    var message_class = "alert-chat-message-" + ($("#chat_container").children().length % 2 ? "even" : "odd");
    var time = new Date(0);
    time.setMilliseconds(data.timestamp);
    console.log(time);
    $("<div />").addClass("alert " + message_class).css({
        "margin-bottom": "0.65em"
    }).html("<img src=\"" + data.gravatar + "?size=16\" />&nbsp;&nbsp;<strong>[" + time.toUTCString() + "] " + data.username.replace(/^(\w*)@.*$/, "$1") + ":</strong>&nbsp;&nbsp;" + data.text).prependTo("#chat_container");
}

function show_view(view) {
    $(".view").fadeOut(200);
    $(".menu_item").removeClass("active");
    setTimeout(function() {
        $("#" + view).fadeIn(200);
        $("#" + view + "_page").addClass('active');
    }, 200);
}
