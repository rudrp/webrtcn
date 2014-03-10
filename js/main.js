/**
 * Created by August on 14-2-28.
 */

var localVideo, remote, remoteVideo, localStream, remoteStream;
var isInitiator = false;
var isStarted = false;
var isChannelReady = false;

var clientArray = [];
var pc = [];
var clientID = document.getElementById("clientID");

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
    'mandatory': {
    'OfferToReceiveAudio':true,
    'OfferToReceiveVideo':true
    }
};

var room = location.pathname.substring(1);
if (room === '') {
//  room = prompt('Enter room name:');
    room = 'foo';
} else {
    //
}

var socket = io.connect();

socket.on('connect', function () {
    clientID.value = this.socket.sessionid;
});

if (room !== '') {
    console.log('Create or join room', room);
    socket.emit('create or join', room);
}

socket.on('session', function(session){
    //console.log('ssssssssssssssssssssssss'+session+'sssssssssssssssssssssssssssssssssss');
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
        onRemoteHangup();
    }
});

initialize();

function initialize() {
    localVideo = document.getElementById("localVideo");
    remoteVideo = document.getElementById("remoteVideo");
    remote = document.getElementById("remotes");
    doGetUserMedia();
}

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

function onUserMediaSuccess(stream) {
    console.log("User has granted access to local media.");
    //clientID.value = Math.round(Math.random()*10000);
    // Call the polyfill wrapper to attach the media stream to this element.
    attachMediaStream(localVideo, stream);
    localVideo.style.opacity = 1;
    localStream = stream;
    sendMessage({
        type: 'got user media',
        id: clientID.value
    });
    if(!isInitiator){
        for(var i=0;i<clientArray.length;i++){
            console.log(clientArray);
            // Caller creates PeerConnection.
            maybeStart(clientArray[i], i);
        }
    }
}

function maybeStart(calleeID, i) {
    if (typeof localStream != 'undefined' && isChannelReady) {
        createPeerConnection(i);
        //pc = pc+i;
        pc[i].addStream(localStream);
        isStarted = true;
        if(calleeID!=clientID.value){
            // Caller initiates offer to peer.
            console.log("call happened!");
            console.log(calleeID);
            console.log(clientID);
            doCall(calleeID, clientID.value, i);
        }
    }
}

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
        pc[i].onaddstream = handleRemoteStreamAdded;
        pc[i].onremovestream = handleRemoteStreamRemoved;
        console.log("Created RTCPeerConnnection with config:\n" + "  \"" +
            JSON.stringify(pc_config) + "\".");
    } catch (e) {
        console.log("Failed to create PeerConnection, exception: " + e.message);
        alert("Cannot create RTCPeerConnection object; WebRTC is not supported by this browser.");
    }
}

//function handleIceCandidate(event) {
//    console.log('handleIceCandidate event: ', event);
//    if (event.candidate) {
//        sendMessage({
//            type: 'candidate',
//            label: event.candidate.sdpMLineIndex,
//            id: event.candidate.sdpMid,
//            candidate: event.candidate.candidate});
//    } else {
//        console.log("End of candidates.");
//    }
//}

function handleRemoteStreamAdded(event) {
    console.log('Remote stream added.');
    //remoteVideo.src = window.URL.createObjectURL(event.stream);
    var remoteVideo = document.createElement('video');
    remoteVideo.class = "remoteVideo";
    remoteVideo.src = window.URL.createObjectURL(event.stream);
    remoteVideo.autoplay = "autoplay";
    remote.appendChild(remoteVideo);
    //remoteStream = event.stream;
}

function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
}

// Send BYE on refreshing(or leaving) a demo page
// to ensure the room is cleaned for next session.
window.onbeforeunload = function() {
    sendMessage({type: 'bye'});
}

function onRemoteHangup() {
    console.log('Session terminated.');
    //isInitiator = false;
    var remoteVideo = document.getElementById("remoteVideo");
    remoteVideo.parentNode.removeChild(remoteVideo);
//    remoteVideo.src = '';
    stop();
}

function stop() {
    isStarted = false;
    pc.close();
    pc = null;
    remoteStream = null;
//    msgQueue.length = 0;
}

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
        sendMessage(sessionDescription);
        }, handleCreateOfferError);
}

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
            sendMessage(sessionDescription);
        }, null, sdpConstraints);
}

//function setLocalAndSendMessage(sessionDescription) {
//    // Set Opus as the preferred codec in SDP if Opus is present.
//    sessionDescription.sdp = preferOpus(sessionDescription.sdp);
//    pc.setLocalDescription(sessionDescription);
//    console.log('setLocalAndSendMessage sending message' , sessionDescription);
//    sendMessage(sessionDescription);
//}

function handleCreateOfferError(event){
    console.log('createOffer() error: ', e);
}

// Set Opus as the default audio codec if it's present.
//function preferOpus(sdp) {
//    var sdpLines = sdp.split('\r\n');
//    var mLineIndex;
//    // Search for m line.
//    for (var i = 0; i < sdpLines.length; i++) {
//        if (sdpLines[i].search('m=audio') !== -1) {
//            mLineIndex = i;
//            break;
//        }
//    }
//    if (mLineIndex === null) {
//        return sdp;
//    }
//
//    // If Opus is available, set it as the default in m line.
//    for (i = 0; i < sdpLines.length; i++) {
//        if (sdpLines[i].search('opus/48000') !== -1) {
//            var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
//            if (opusPayload) {
//                sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
//            }
//            break;
//        }
//    }
//
//    // Remove CN in m line and sdp.
//    sdpLines = removeCN(sdpLines, mLineIndex);
//
//    sdp = sdpLines.join('\r\n');
//    return sdp;
//}

//function extractSdp(sdpLine, pattern) {
//    var result = sdpLine.match(pattern);
//    return result && result.length === 2 ? result[1] : null;
//}
//
//// Set the selected codec to the first in m line.
//function setDefaultCodec(mLine, payload) {
//    var elements = mLine.split(' ');
//    var newLine = [];
//    var index = 0;
//    for (var i = 0; i < elements.length; i++) {
//        if (index === 3) { // Format of media starts from the fourth.
//            newLine[index++] = payload; // Put target payload to the first.
//        }
//        if (elements[i] !== payload) {
//            newLine[index++] = elements[i];
//        }
//    }
//    return newLine.join(' ');
//}
//
//// Strip CN from sdp before CN constraints is ready.
//function removeCN(sdpLines, mLineIndex) {
//    var mLineElements = sdpLines[mLineIndex].split(' ');
//    // Scan from end for the convenience of removing an item.
//    for (var i = sdpLines.length-1; i >= 0; i--) {
//        var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
//        if (payload) {
//            var cnPos = mLineElements.indexOf(payload);
//            if (cnPos !== -1) {
//                // Remove CN payload from m line.
//                mLineElements.splice(cnPos, 1);
//            }
//            // Remove CN line in sdp
//            sdpLines.splice(i, 1);
//        }
//    }
//
//    sdpLines[mLineIndex] = mLineElements.join(' ');
//    return sdpLines;
//}
