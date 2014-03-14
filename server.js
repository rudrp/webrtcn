/**
 * run 'node server.js' to set up server
 */

//You don't need to learn about node-static for this exercise: it just makes the server simpler.
var stat = require('node-static');
var http = require('http');
var file = new (stat.Server)();
var app = http.createServer(function (req, res) {
    file.serve(req, res);
}).listen(2014);

var io = require('socket.io').listen(app);

var session_array = [];
io.sockets.on('connection', function (socket) {

    socket.emit('session', session_array);
    session_array.push(socket.id);

    // convenience function to log server messages on the client
    function log() {
        var array = [">>> Message from server: "];
        for (var i = 0; i < arguments.length; i++) {
            array.push(arguments[i]);
        }
        socket.emit('log', array);
    }

    socket.on('message', function (message) {
        log('Got message:', message);
        if(message.type==='offer'){
            io.sockets.socket(message.calleeID).emit('message', message);
        } else if (message.type==='answer'){
            io.sockets.socket(message.callerID).emit('message', message);
        } else if (message.type==='bye'){
            // delete the SocketID in our session array if the client is closed
            for (var i = 0; i < session_array.length; i++) {
                if (session_array[i] == message.clientID){
                    session_array.splice(i,1);
                }
            }
            socket.broadcast.emit('message', message);
        } else {
            // for a real app, would be room only (not broadcast)
            socket.broadcast.emit('message', message);
       }
    });

    socket.on('create or join', function (room) {
        var numClients = io.sockets.clients(room).length;

        log('Room ' + room + ' has ' + numClients + ' client(s)');
        log('Request to create or join room ' + room);

        if (numClients === 0) {
            socket.join(room);
            socket.emit('created', room);
        } else if (numClients < 7) {
            io.sockets.in(room).emit('join', room);
            socket.join(room);
            socket.emit('joined', room);
        } else { // max two clients
            socket.emit('full', room);
        }
        socket.emit('emit(): client ' + socket.id + ' joined room ' + room);
        socket.broadcast.emit('broadcast(): client ' + socket.id + ' joined room ' + room);

    });
});