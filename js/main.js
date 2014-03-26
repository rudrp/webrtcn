/**
 * Created by Yang Xiao Ming on 14-2-28.
 */

var localVideo, remote, remoteVideo, localStream, remoteStream;
var isInitiator = false;
var isStarted = false;
var isChannelReady = false;

var clientArray = [];
var pc = [];
var clientID = document.getElementById("clientID");
var localStreamID = document.getElementById("localStreamID");

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
    'mandatory': {
    'OfferToReceiveAudio':true,
    'OfferToReceiveVideo':true
    }
};

var room = location.pathname.substring(1);
if (room === '') {
    room = prompt('Enter room name:');
    document.getElementById("header").innerHTML = "This is room " + room;
} else {
    room = 'foo';
}

var socket = io.connect();

socket.on('connect', function () {
    clientID.value = this.socket.sessionid;
    // Initial
    initialize();
});

if (room !== '') {
    console.log('Create or join room', room);
    socket.emit('create or join', room);
}

socket.on('session', function(session){
    clientArray = session;
});

socket.on('created', function (room){
    console.log(this.socket.sessionid);
    console.log('Created room ' + room);
    isInitiator = true;
});

socket.on('full', function (room){
    console.log('Room ' + room + ' is full');
});

socket.on('join', function (room){
    console.log('Another peer made a request to join room ' + room);
    console.log('This peer is the initiator of room ' + room + '!');
    isChannelReady = true;
});

socket.on('joined', function (room){
    console.log('This peer has joined room ' + room);
    isChannelReady = true;
});

socket.on('log', function (array){
    console.log.apply(console, array);
});


function sendMessage(message){
    console.log('Client sending message: ', message);
    // if (typeof message === 'object') {
    //   message = JSON.stringify(message);
    // }
    socket.emit('message', message);
}

socket.on('message', function (message){
    console.log('Client received message:', message);
    if (message.type === 'got user media') {
       // maybeStart(message.id);
    } else if (message.type === 'offer') {
        maybeStart(message.calleeID, message.peerNum);
        pc[message.peerNum].setRemoteDescription(new RTCSessionDescription(message));
        doAnswer(message.calleeID, message.callerID, message.peerNum);
    } else if (message.type === 'answer') {
        // remoteDescription should only be built between two peers not all available peers
        pc[message.peerNum].setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' ) {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });

        try{
            pc[message.peerNum].addIceCandidate(candidate)
        }catch(e){
            console.log('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'+e);
        }

    } else if (message.type === 'bye') {
        onRemoteHangup(message.streamID);
    }
});

// Above is all about variables and socket.io
// This part is something about the response of client to message from server
/****************************************Divided******************************************************/
// Below is all about functions


/**
 * Main entry function
 */
function initialize() {
    localVideo = document.getElementById("localVideo");
    remoteVideo = document.getElementById("remoteVideo");
    remote = document.getElementById("remotes");
    doGetUserMedia();
}

/**
 * Adapter.js is used to get user media
 */
function doGetUserMedia() {
    // Call into getUserMedia via the polyfill (adapter.js).
    try {
        getUserMedia({video: true, audio: true}, onUserMediaSuccess, function(error){
            trace("getUserMedia error:");
        });
    } catch (e) {
        alert('getUserMedia() failed. Is this a WebRTC capable browser?');
        trace('getUserMedia failed with exception: ' + e.message);
    }
}

/**
 * If get user media is successful, this function will be called
 *
 * @param stream
 */
function onUserMediaSuccess(stream) {
    console.log("User has granted access to local media.");
    // Call the polyfill wrapper to attach the media stream to this element.
    attachMediaStream(localVideo, stream);
    localVideo.style.opacity = 1;
    localStream = stream;
    sendMessage({
        type: 'got user media',
        id: clientID.value
    });

    // Each new comer except the creator will set up peerConnection and do some calling
    if(!isInitiator){
        for(var i=0;i<clientArray.length;i++){
            // Only in this room's client should be called
            if(clientArray[i].slice(20)==room){
                // Caller creates PeerConnection.
                maybeStart(clientArray[i].slice(0,20), i);
            }
        }
    }
}

/**
 * Set up RTCPeerConnection and do some calling
 *
 * @param calleeID
 * @param i the number of peerConnection
 */
function maybeStart(calleeID, i) {
    if (typeof localStream != 'undefined' && isChannelReady) {
        createPeerConnection(i);
        pc[i].addStream(localStream);
        isStarted = true;
        if(calleeID!=clientID.value){
            // Caller initiates offer to peer.
            doCall(calleeID, clientID.value, i);
        }
    }
}

/**
 * The most important thing is to create peer connection between peers
 *
 * @param i
 */
function createPeerConnection(i) {
    var pc_config = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]};
    try {
        // Create an RTCPeerConnection via the polyfill (adapter.js).
        pc[i] = new RTCPeerConnection(pc_config);
        pc[i].onicecandidate = function(event){
            console.log('handleIceCandidate event: ', event);
            if (event.candidate) {
                sendMessage({
                    type: 'candidate',
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    peerNum: i,
                    candidate: event.candidate.candidate});
            } else {
                console.log("End of candidates.");
            }
        };
        // When remote stream is ready to add, the function is called
        pc[i].onaddstream = function(event){
            console.log('Remote stream added.');
            var remoteVideo = document.createElement('video');
            remoteVideo.id = event.stream.id;
            remoteVideo.src = window.URL.createObjectURL(event.stream);
            remoteVideo.autoplay = "autoplay";
            remote.appendChild(remoteVideo);
        };
        pc[i].onremovestream = handleRemoteStreamRemoved;
        console.log("Created RTCPeerConnnection with config:\n" + "  \"" +
            JSON.stringify(pc_config) + "\".");
    } catch (e) {
        console.log("Failed to create PeerConnection, exception: " + e.message);
        alert("Cannot create RTCPeerConnection object; WebRTC is not supported by this browser.");
    }
}

/**
 * When remote stream is removed, the function is called
 * todo: remove the removed stream on other peer's screen
 *
 * @param event
 */
function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
}

// Send BYE on refreshing(or leaving) a demo page
// to ensure the room is cleaned for next session.
window.onbeforeunload = function() {
    sendMessage({
        type: 'bye',
        clientID:clientID.value,
        streamID:localStreamID.value,
        room:room
    });
}

function onRemoteHangup(streamID) {
    console.log('Session terminated.');
    var remoteVideo = document.getElementById(streamID);
    remoteVideo.parentNode.removeChild(remoteVideo);
//    remoteVideo.src = '';
    //stop();
}

function pause_me_from_chatting(){
    //alert(clientID.value+' '+localStreamID.value);
    pc[0].removeStream(localStream);
}

//function stop() {
//    isStarted = false;
//    pc.close();
//    pc = null;
//    remoteStream = null;
////    msgQueue.length = 0;
//}

/**
 * Main calling function
 *
 * @param calleeID
 * @param callerID
 * @param i
 */
function doCall(calleeID, callerID, i) {
    console.log('Sending offer to peer');
    pc[i].createOffer(
        function(sessionDescription){
        // Set Opus as the preferred codec in SDP if Opus is present.
        //sessionDescription.sdp = preferOpus(sessionDescription.sdp);
        sessionDescription.calleeID = calleeID;
        sessionDescription.callerID = callerID;
        sessionDescription.peerNum = i;
        pc[i].setLocalDescription(sessionDescription);
        console.log('setLocalAndSendMessage sending message' , sessionDescription);
        localStreamID.value = sessionDescription.sdp.match(/msid:(.*) /)[1];
        sendMessage(sessionDescription);
        }, handleCreateOfferError);
}

/**
 * Main answering function
 *
 * @param calleeID
 * @param callerID
 * @param peerNum
 */
function doAnswer(calleeID, callerID, peerNum) {
    console.log('Sending answer to peer.');
    pc[peerNum].createAnswer(
        function(sessionDescription){
            // Set Opus as the preferred codec in SDP if Opus is present.
            //sessionDescription.sdp = preferOpus(sessionDescription.sdp);
            sessionDescription.calleeID = calleeID;
            sessionDescription.callerID = callerID;
            sessionDescription.peerNum = peerNum;
            pc[peerNum].setLocalDescription(sessionDescription);
            console.log('setLocalAndSendMessage sending message' , sessionDescription);
            localStreamID.value = sessionDescription.sdp.match(/msid:(.*) /)[1];
            sendMessage(sessionDescription);
        }, null, sdpConstraints);
}

function handleCreateOfferError(event){
    console.log('createOffer() error: ', e);
}
