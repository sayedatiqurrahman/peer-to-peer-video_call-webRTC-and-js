
  // Elements
    const startBtn = document.getElementById('startBtn');
    const createOfferBtn = document.getElementById('createOfferBtn');
    const setRemoteAnswerBtn = document.getElementById('setRemoteAnswerBtn');
    const localAudio = document.getElementById('localAudio');
    const remoteAudio = document.getElementById('remoteAudio');
    const localSDPTextarea = document.getElementById('localSDP');
    const remoteSDPTextarea = document.getElementById('remoteSDP');
    const pasteRemoteBtn = document.getElementById('pasteRemoteBtn');
    const copyLocalBtn = document.getElementById('copyLocal');
    const clearLocalBtn = document.getElementById('clearLocal');
    const clearRemoteBtn = document.getElementById('clearRemote');
    const logEl = document.getElementById('log');

    // State
    let pc = null;
    let localStream = null;
    let isOfferer = false;

    // helpers
    function log(...args) {
        console.log(...args);
    const s = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    logEl.textContent += s + '\\n';
    logEl.scrollTop = logEl.scrollHeight;
  }

    function waitForIceGatheringComplete(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
      } else {
        function check(e) {
            if (pc.iceGatheringState === 'complete') {
                pc.removeEventListener('icegatheringstatechange', check);
                resolve();
            }
        }
        pc.addEventListener('icegatheringstatechange', check);
        // also resolve when final candidate (null) is seen
        const onIce = (evt) => {
          if (!evt.candidate) {
        pc.removeEventListener('icecandidate', onIce);
    resolve();
          }
        };
    pc.addEventListener('icecandidate', onIce);
      }
    });
  }

    async function createPeerConnection() {
    const config = {iceServers: [{urls: ["stun:stun.l.google.com:19302"] }] }; // public STUN
    pc = new RTCPeerConnection(config);

    pc.onicecandidate = (event) => {
        // we intentionally do not send candidates automatically;
        // we wait for ICE gathering to finish then show full SDP so
        // copy/paste contains candidates.
        log('icecandidate', event.candidate);
    };

    pc.ontrack = (event) => {
        log('ontrack event, streams:', event.streams);
    const [remoteStream] = event.streams;
    remoteAudio.srcObject = remoteStream;
    };

    pc.onconnectionstatechange = () => {
        log('connectionState:', pc.connectionState);
    };

    return pc;
  }

  // Start: getUserMedia
  startBtn.onclick = async () => {
    try {
        startBtn.disabled = true;
    localStream = await navigator.mediaDevices.getUserMedia({audio: true });
    localAudio.srcObject = localStream;
    log('Microphone captured.');
    createOfferBtn.disabled = false;
    } catch (err) {
        log('Failed to get microphone:', err);
    startBtn.disabled = false;
    }
  };

  // Create Offer (Offerer)
  createOfferBtn.onclick = async () => {
    if (!localStream) return alert('Start microphone first.');

    isOfferer = true;
    createOfferBtn.disabled = true;
    setRemoteAnswerBtn.disabled = false;
    try {
        await createPeerConnection();

      // add local tracks
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });

    // create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // wait until ICE candidates are gathered and included in sdp
    await waitForIceGatheringComplete(pc);

    // now show local SDP (with ICE candidates)
    localSDPTextarea.value = JSON.stringify(pc.localDescription);
    log('Offer created — copy the Local SDP and send to remote peer.');
    } catch (err) {
        log('Error creating offer:', err);
    }
  };

  // Paste Remote SDP: This button will either set an Answer (if we were offerer)
  // or set an Offer (if we are answering) and create an Answer to send back.
  pasteRemoteBtn.onclick = async () => {
    const text = remoteSDPTextarea.value.trim();
    if (!text) return alert('Paste the remote SDP (offer or answer) into the right textarea first.');

    let remoteDesc;
    try {
        remoteDesc = JSON.parse(text);
    } catch (e) {
      // Maybe user pasted just SDP string instead of JSON — attempt to construct
      try {
        remoteDesc = { type: (text.indexOf('a=') === -1 ? 'offer' : 'offer'), sdp: text };
      } catch (err) {
        return alert('Invalid SDP format. Paste the full JSON produced by the other side.');
      }
    }

    // If we are already an offerer and we are expecting an answer:
    if (isOfferer && remoteDesc.type === 'answer') {
      // This is the answer to our offer:
      try {
        await pc.setRemoteDescription(remoteDesc);
    log('Remote answer set. Connection should establish when ICE completes on both sides.');
      } catch (err) {
        log('Failed to set remote answer:', err);
      }
    return;
    }

    // If we didn't have a pc yet (we are the answerer), create and respond with an answer:
    if (!pc) {
        await createPeerConnection();
    }

    // add local tracks (if not yet added)
    if (localStream) {
        localStream.getTracks().forEach(track => {
            // Avoid adding duplicate tracks if already added
            const already = pc.getSenders().some(s => s.track === track);
            if (!already) pc.addTrack(track, localStream);
        });
    }

    // set remote offer (someone sent us an offer)
    if (remoteDesc.type === 'offer') {
      try {
        await pc.setRemoteDescription(remoteDesc);
    log('Remote offer set. Creating answer...');

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // wait for ICE gathering
    await waitForIceGatheringComplete(pc);

    // show answer (copy & send this back to offerer)
    localSDPTextarea.value = JSON.stringify(pc.localDescription);
    log('Answer created — copy the Local SDP and send back to the offerer.');
      } catch (err) {
        log('Error handling remote offer:', err);
      }
    return;
    }

    // If a non-offer/answer or unexpected type:
    log('Remote SDP type is', remoteDesc.type, '- nothing to do automatically.');
  };

  // Set Remote Answer explicitly (for offerer to paste answer)
  setRemoteAnswerBtn.onclick = async () => {
    const text = remoteSDPTextarea.value.trim();
    if (!text) return alert('Paste the remote answer SDP into the right textarea.');
    let remoteDesc;
    try {
        remoteDesc = JSON.parse(text);
    } catch (e) {
      return alert('Invalid JSON. Paste exact JSON produced by the answerer.');
    }
    if (!pc) return alert('No peer connection exists. Did you create an offer?');
    try {
        await pc.setRemoteDescription(remoteDesc);
    log('Remote answer set. Connection should establish shortly.');
    setRemoteAnswerBtn.disabled = true;
    } catch (err) {
        log('Failed to set remote answer:', err);
    }
  };

  // Copy local SDP
  copyLocalBtn.onclick = () => {
        localSDPTextarea.select();
    try {
        document.execCommand('copy');
    log('Local SDP copied to clipboard.');
    } catch (err) {
        log('Copy failed, please copy manually.');
    }
  };

  clearLocalBtn.onclick = () => {localSDPTextarea.value = ''; };
  clearRemoteBtn.onclick = () => {remoteSDPTextarea.value = ''; };

  // simple page-unload cleanup
  window.addEventListener('beforeunload', () => {
    try { if (pc) pc.close(); } catch(e){ }
    try { if (localStream) localStream.getTracks().forEach(t => t.stop()); } catch(e){ }
  });
