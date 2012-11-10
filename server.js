var http = require('http'),
    static = require('send'),
    socketio = require('socket.io');

var handler = function(request, response) {
    static(request, request.url).root('html').pipe(response);
};

var app = http.createServer(handler),
    io = socketio.listen(app);

io.sockets.on('connection', function(socket) {
    socket.emit('news', {hello: 'world'});
    socket.on('my other event', function(data) {
        console.log(data);
    });
});

app.listen(8000);
