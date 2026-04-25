document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const screens = {
    landing: document.getElementById('screen-landing'),
    permission: document.getElementById('screen-permission'),
    scan: document.getElementById('screen-scan'),
    building: document.getElementById('screen-building'),
    feed: document.getElementById('screen-feed')
  };

  const buttons = {
    begin: document.getElementById('btn-begin-scan'),
    ready: document.getElementById('btn-ready'),
    startStep: document.getElementById('btn-start-step'),
    hearBeat: document.getElementById('btn-hear-beat'),
    scanAgain1: document.getElementById('btn-scan-again-1'),
    scanAgain2: document.getElementById('btn-scan-again-2'),
    copyDna: document.getElementById('btn-copy-dna')
  };

  const videoElement = document.getElementById('webcam');
  const canvasElement = document.getElementById('output_canvas');
  const canvasCtx = canvasElement.getContext('2d');
  
  // State
  let cameraStream = null;
  let faceMesh = null;
  let hands = null;
  let camera = null;
  let isScanning = false;
  
  let scanData = {
    faceRatio: 0,
    eyeOpenness: 0,
    browHeight: 0,
    mouthWidth: 0,
    smileScore: 0,
    frownScore: 0,
    fingerCount: 0
  };

  let metricsAccumulator = {
    faceRatio: [], eyeOpenness: [], browHeight: [], mouthWidth: [], smileScore: [], frownScore: [], fingerCount: []
  };

  let customScanPrompt = null;

  const personalityTypes = [
    { id: 'CHAOS', name: 'THE CHAOS AGENT', desc: 'Unpredictable frequencies. You break the grid and make it sound good.' },
    { id: 'OLD', name: 'THE OLD SOUL', desc: 'Analog warmth in a digital world. Your resonance is timeless.' },
    { id: 'OVERTHINKER', name: 'THE OVERTHINKER', desc: 'Complex polyrhythms. Every detail of your face is processing something.' },
    { id: 'SILENT', name: 'THE SILENT ASSASSIN', desc: 'Minimalist. Lethal. You do more with a single glance than most do with a shout.' },
    { id: 'MAIN', name: 'THE MAIN CHARACTER', desc: 'Front and center. Your features demand the spotlight frequency.' },
    { id: 'WILDCARD', name: 'THE WILDCARD', desc: 'Glitch in the matrix. We tried to categorize you and the system crashed.' },
    { id: 'PHILOSOPHER', name: 'THE PHILOSOPHER', desc: 'Deep, resonant basslines. You are contemplating the universe.' },
    { id: 'HYPE', name: 'THE HYPE MACHINE', desc: 'Maximum BPM. Your resting face is a drop waiting to happen.' }
  ];

  let currentPersonality = null;
  let currentDna = '';
  let toneSetup = false;
  let isPlaying = false;
  
  // Audio synths
  let kick, snare, hihat, synthBass, synthChord;
  let reverb, filter, mainOut;
  let sequence;
  let analyser;
  let vizCanvas, vizCtx, vizLoopId;

  // Navigation functions
  function switchScreen(screenName) {
    Object.values(screens).forEach(screen => {
      screen.classList.remove('active');
      screen.classList.add('hidden');
    });
    screens[screenName].classList.remove('hidden');
    // small timeout to allow display:block to apply before opacity transition
    setTimeout(() => {
      screens[screenName].classList.add('active');
    }, 50);
  }

  // Initial Events
  buttons.begin.addEventListener('click', async () => {
    await Tone.start();
    
    if (!toneSetup) {
      analyser = new Tone.Analyser("fft", 64);
      
      reverb = new Tone.Reverb(2).connect(analyser);
      filter = new Tone.Filter(2000, "lowpass").connect(reverb);
      mainOut = new Tone.Volume(0).connect(filter);
      
      kick = new Tone.MembraneSynth().connect(mainOut);
      snare = new Tone.NoiseSynth({ volume: -5 }).connect(mainOut);
      hihat = new Tone.MetalSynth({ envelope: { attack: 0.01, decay: 0.1, release: 0.01 } }).connect(mainOut);
      synthBass = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.05, decay: 0.2, sustain: 0.2, release: 1 } }).connect(mainOut);
      synthBass.volume.value = -10;
      
      synthChord = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        volume: -15
      }).connect(mainOut);

      analyser.toDestination();
      toneSetup = true;
    }

    switchScreen('permission');
    initCamera();
  });

  buttons.ready.addEventListener('click', () => {
    switchScreen('scan');
    startScanSequence();
  });

  buttons.startStep.addEventListener('click', () => {
    buttons.startStep.style.opacity = '0';
    setTimeout(() => {
      buttons.startStep.classList.add('hidden');
      document.querySelector('.confidence-container').style.opacity = '1';
      document.getElementById('scan-dynamic-prompt').classList.remove('hidden');
      isStepActive = true;
    }, 500);
  });

  // Set up Scroll Animations & Parallax
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.scroll-section').forEach(sec => {
    observer.observe(sec);
  });

  window.addEventListener('scroll', () => {
    const grid = document.querySelector('.bg-grid');
    if (grid) {
      const scrolled = window.scrollY;
      grid.style.transform = `translate3d(0, ${scrolled * 0.3}px, 0)`;
    }
    
    // Scroll progress bar
    const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    if (height > 0) {
      const scrolledRatio = (winScroll / height) * 100;
      const progressBar = document.getElementById('scroll-progress-bar');
      if (progressBar) progressBar.style.width = scrolledRatio + "%";
    }
    
    // Back to top button
    const backBtn = document.getElementById('btn-back-to-top');
    if (backBtn) {
      if (winScroll > 300) backBtn.classList.remove('hidden');
      else backBtn.classList.add('hidden');
    }
  });

  const btnBackToTop = document.getElementById('btn-back-to-top');
  if (btnBackToTop) {
    btnBackToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Camera & MediaPipe Setup
  async function initCamera() {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      videoElement.srcObject = cameraStream;
      videoElement.classList.add('feed-active');
      
      // Initialize MediaPipe
      initMediaPipe();
      
      // Show ready button after 2s
      setTimeout(() => {
        document.querySelector('.status-text').classList.add('hidden');
        buttons.ready.classList.remove('hidden-opacity');
      }, 2000);
      
    } catch (err) {
      console.error('Camera error:', err);
      document.querySelector('.status-text').innerText = "Camera access denied or failed.";
      document.querySelector('.status-text').classList.remove('blink');
    }
  }

  function initMediaPipe() {
    // FaceMesh
    faceMesh = new FaceMesh({locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
    }});
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    faceMesh.onResults(onFaceResults);

    // Hands
    hands = new Hands({locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }});
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    hands.onResults(onHandResults);

    camera = new Camera(videoElement, {
      onFrame: async () => {
        if (isScanning) {
          await faceMesh.send({image: videoElement});
          await hands.send({image: videoElement});
        }
      },
      width: 640,
      height: 480
    });
    camera.start();
  }

  let latestFace = null;
  let latestHands = [];
  let currentStepIndex = -1;
  let stepConfidence = 0;
  let framesAt100 = 0;
  let isStepLocked = false;
  let isStepActive = false;
  let scanLoopId = null;

  // MediaPipe Results Processing
  function onFaceResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      latestFace = results.multiFaceLandmarks[0];
      drawConnectors(canvasCtx, latestFace, FACEMESH_TESSELATION, {color: 'rgba(0, 255, 136, 0.2)', lineWidth: 0.5});
      
      const top = latestFace[10];
      const bottom = latestFace[152];
      const left = latestFace[234];
      const right = latestFace[454];
      const faceHeight = Math.hypot(bottom.x - top.x, bottom.y - top.y);
      const faceWidth = Math.hypot(right.x - left.x, right.y - left.y);
      metricsAccumulator.faceRatio.push(faceWidth / faceHeight);

      const eyeTop = latestFace[159];
      const eyeBot = latestFace[145];
      metricsAccumulator.eyeOpenness.push(Math.hypot(eyeBot.x - eyeTop.x, eyeBot.y - eyeTop.y));

      const brow = latestFace[105];
      metricsAccumulator.browHeight.push(Math.hypot(eyeTop.x - brow.x, eyeTop.y - brow.y));

      const mouthL = latestFace[61];
      const mouthR = latestFace[291];
      const mWidth = Math.hypot(mouthR.x - mouthL.x, mouthR.y - mouthL.y);
      metricsAccumulator.mouthWidth.push(mWidth);

      const centerMouth = latestFace[13];
      metricsAccumulator.smileScore.push(((centerMouth.y - mouthL.y) + (centerMouth.y - mouthR.y)) / 2);
      metricsAccumulator.frownScore.push(((mouthL.y - centerMouth.y) + (mouthR.y - centerMouth.y)) / 2);
    } else {
      latestFace = null;
    }
    canvasCtx.restore();
  }

  function onHandResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      latestHands = results.multiHandLandmarks;
      metricsAccumulator.fingerCount.push(latestHands.length * 5); 
      
      canvasCtx.save();
      for (const landmarks of latestHands) {
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#00ff88', lineWidth: 2});
        drawLandmarks(canvasCtx, landmarks, {color: '#00d4ff', lineWidth: 1, radius: 2});
      }
      canvasCtx.restore();
    } else {
      latestHands = [];
      metricsAccumulator.fingerCount.push(0);
    }
  }

  // Scanning Sequence Logic
  const scanStepsConfig = [
    {
      instruction: "Hold still. Face the camera directly.",
      prompt: "Position your face in the frame",
      lockText: "FACE LOCKED",
      effectClass: "scan-effect-1",
      lines: ["Structured. Deliberate. The universe had a plan when it made this face.", "Free-form. Unpredictable. Exactly how it should be."]
    },
    {
      instruction: "Open your eyes wide. Don't blink.",
      prompt: "Open your eyes wider",
      lockText: "EYES LOCKED",
      effectClass: "scan-effect-2",
      lines: ["These eyes have processed a lot. The melody agrees.", "Calm. Focused. Your synth layer is already in therapy."]
    },
    {
      instruction: "Raise your eyebrows slightly. A gentle lift is enough.",
      prompt: "Raise your eyebrows slightly",
      lockText: "EXPRESSION LOCKED",
      effectClass: "scan-effect-3",
      lines: ["Maximum expression detected. The reverb is crying.", "Subtle. Controlled. Someone here does not panic easily."]
    },
    {
      instruction: "Relax your face completely. Natural expression.",
      prompt: "Relax your face completely",
      lockText: "DEPTH LOCKED",
      effectClass: "scan-effect-4",
      lines: ["The bass doesn't lie. Yours just said something very specific.", "Deep frequencies. You probably have strong opinions about things."]
    },
    {
      instruction: "Give us your biggest smile. Don't hold back.",
      prompt: "Give us a bigger smile",
      lockText: "PULSE LOCKED",
      effectClass: "scan-effect-5",
      lines: ["That smile just unlocked a percussion layer.", "Reserved energy. Saving it for the right moment. Respect."]
    },
    {
      instruction: "Hold both hands up to the camera. Spread your fingers.",
      prompt: "Show both hands with fingers spread",
      lockText: "COMPLEXITY LOCKED",
      effectClass: "scan-effect-6",
      lines: ["Full expression. All channels open.", "Selective. You don't give everything away at once."]
    }
  ];

  function evaluateConfidence() {
    if (!isScanning || isStepLocked || currentStepIndex < 0) return 0;
    
    let conf = 0;
    if (currentStepIndex === 5) {
      if (latestHands.length === 2) {
        conf = 100;
      } else if (latestHands.length === 1) {
        conf = 50;
      }
      return conf;
    }

    if (!latestFace) return 0;

    const eyeTop = latestFace[159];
    const eyeBot = latestFace[145];
    const eyeOpenness = Math.hypot(eyeBot.x - eyeTop.x, eyeBot.y - eyeTop.y);

    const brow = latestFace[105];
    const browHeight = Math.hypot(eyeTop.x - brow.x, eyeTop.y - brow.y);

    const mouthL = latestFace[61];
    const mouthR = latestFace[291];
    const centerMouth = latestFace[13];
    const smileScore = ((centerMouth.y - mouthL.y) + (centerMouth.y - mouthR.y)) / 2;
    const frownScore = ((mouthL.y - centerMouth.y) + (mouthR.y - centerMouth.y)) / 2;

    customScanPrompt = null;
    switch (currentStepIndex) {
      case 0:
        conf = 100;
        break;
      case 1:
        conf = Math.min(100, Math.max(0, (eyeOpenness - 0.008) * 6000));
        break;
      case 2:
        conf = Math.min(100, Math.max(0, (browHeight - 0.033) * 6000));
        break;
      case 3:
        const isSmiling = smileScore > 0.005;
        const isFrowning = frownScore > 0.003;
        const isRaised = browHeight > 0.04;
        
        if (!isSmiling && !isFrowning && !isRaised) {
          conf = 100;
          customScanPrompt = "Perfect — hold still";
        } else {
          conf = 10;
          if (isSmiling) customScanPrompt = "Relax your smile";
          else if (isFrowning) customScanPrompt = "Soften your expression";
          else if (isRaised) customScanPrompt = "Lower your eyebrows";
        }
        break;
      case 4:
        conf = Math.min(100, Math.max(0, smileScore * 8000));
        break;
    }
    
    return Math.round(conf);
  }

  function scanLoop() {
    if (!isScanning) return;

    if (!isStepLocked && isStepActive) {
      stepConfidence = evaluateConfidence();
      
      const barFill = document.getElementById('confidence-bar-fill');
      const valEl = document.getElementById('confidence-value');
      
      barFill.style.width = `${stepConfidence}%`;
      valEl.innerText = stepConfidence;
      
      const step = scanStepsConfig[currentStepIndex];
      const targetThreshold = [65, 70, 70, 65, 85, 70][currentStepIndex];
      const promptEl = document.getElementById('scan-dynamic-prompt');
      
      if (stepConfidence >= targetThreshold) {
        barFill.classList.add('high');
        promptEl.innerText = "Hold it...";
        framesAt100++;
        // Approx 30 frames = 1 second
        if (framesAt100 > 30) {
          promptEl.innerText = "Locked!";
          lockCurrentStep();
        }
      } else {
        barFill.classList.remove('high');
        if (customScanPrompt) {
          promptEl.innerText = customScanPrompt;
        } else if (stepConfidence >= targetThreshold - 20) {
          promptEl.innerText = "Almost there...";
        } else {
          promptEl.innerText = step.prompt;
        }
        framesAt100 = 0;
      }
    }

    scanLoopId = requestAnimationFrame(scanLoop);
  }

  function startScanSequence() {
    isScanning = true;
    currentStepIndex = 0;
    setupCurrentStep();
    scanLoop();
  }

  function setupCurrentStep() {
    if (currentStepIndex >= scanStepsConfig.length) {
      finishScan();
      return;
    }
    
    isStepLocked = false;
    isStepActive = false;
    stepConfidence = 0;
    framesAt100 = 0;
    
    const step = scanStepsConfig[currentStepIndex];
    
    document.getElementById('scan-instruction').innerText = step.instruction;
    document.getElementById('scan-dynamic-prompt').innerText = step.prompt;
    document.getElementById('scan-dynamic-prompt').classList.add('hidden');
    document.getElementById('scan-overlay-effect').className = `scan-overlay ${step.effectClass}`;
    document.getElementById('scan-one-liner').classList.remove('visible');
    document.getElementById('lock-status').classList.add('hidden');
    document.getElementById('step-counter').innerText = currentStepIndex + 1;
    
    // Reset start button and confidence UI
    buttons.startStep.classList.remove('hidden');
    buttons.startStep.style.opacity = '1';
    
    const confContainer = document.querySelector('.confidence-container');
    confContainer.style.transition = 'opacity 0.5s ease';
    confContainer.style.opacity = '0';
    
    document.getElementById('confidence-bar-fill').style.width = '0%';
    document.getElementById('confidence-value').innerText = '0';
    document.getElementById('confidence-bar-fill').classList.remove('high');
    
    document.querySelectorAll('.progress-dots .dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === currentStepIndex);
    });
  }

  function lockCurrentStep() {
    isStepLocked = true;
    const step = scanStepsConfig[currentStepIndex];
    
    document.getElementById('scan-dynamic-prompt').classList.add('hidden');
    const lockStatus = document.getElementById('lock-status');
    document.getElementById('lock-text').innerText = step.lockText;
    lockStatus.classList.remove('hidden');
    
    const flashEl = document.getElementById('flash-effect');
    flashEl.classList.remove('hidden');
    flashEl.classList.add('trigger');
    setTimeout(() => {
      flashEl.classList.add('hidden');
      flashEl.classList.remove('trigger');
    }, 800);

    const oneLinerEl = document.getElementById('scan-one-liner');
    oneLinerEl.innerText = step.lines[Math.floor(Math.random() * step.lines.length)];
    oneLinerEl.classList.add('visible');

    setTimeout(() => {
      currentStepIndex++;
      setupCurrentStep();
    }, 2000);
  }

  function getAverage(arr) {
    if (!arr || arr.length === 0) return 0;
    const sum = arr.reduce((a, b) => a + b, 0);
    return sum / arr.length;
  }

  function finishScan() {
    isScanning = false;
    
    // Calculate final metrics
    scanData.faceRatio = getAverage(metricsAccumulator.faceRatio);
    scanData.eyeOpenness = getAverage(metricsAccumulator.eyeOpenness);
    scanData.browHeight = getAverage(metricsAccumulator.browHeight);
    scanData.mouthWidth = getAverage(metricsAccumulator.mouthWidth);
    scanData.smileScore = getAverage(metricsAccumulator.smileScore);
    scanData.frownScore = getAverage(metricsAccumulator.frownScore);
    scanData.fingerCount = getAverage(metricsAccumulator.fingerCount);

    determinePersonality();
    
    switchScreen('building');
    runBeatBuildingAnimation();
  }

  function calculateBeatProfile() {
    const bpmBase = Math.floor(100 + (scanData.faceRatio * 50));
    
    let energyVal = Math.min(100, Math.max(0, (scanData.browHeight * 1000) + (scanData.smileScore * 5000)));
    let energyDesc = "Grounded";
    if (energyVal > 30) energyDesc = "Charged";
    if (energyVal > 70) energyDesc = "Explosive";
    
    let moodVal = Math.min(100, Math.max(0, scanData.smileScore * 8000));
    let moodDesc = "Melancholic";
    if (moodVal > 30) moodDesc = "Balanced";
    if (moodVal > 70) moodDesc = "Euphoric";
    
    let fingers = Math.min(10, Math.round(scanData.fingerCount));
    let rhythmVal = Math.ceil(fingers / 2) || 1;
    let rhythmDesc = "Minimal";
    if (rhythmVal > 2) rhythmDesc = "Moderate";
    if (rhythmVal > 4) rhythmDesc = "Complex";

    let bassVal = Math.min(100, Math.max(0, (scanData.faceRatio - 0.5) * 200));
    let bassDesc = "Subtle";
    if (bassVal > 40) bassDesc = "Warm";
    if (bassVal > 80) bassDesc = "Heavy";

    let rangeVal = Math.min(100, Math.max(0, (scanData.eyeOpenness - 0.01) * 3000));
    let rangeDesc = "Intimate";
    if (rangeVal > 40) rangeDesc = "Flowing";
    if (rangeVal > 80) rangeDesc = "Expansive";

    return { bpmBase, energyVal, energyDesc, moodVal, moodDesc, rhythmVal, rhythmDesc, bassVal, bassDesc, rangeVal, rangeDesc };
  }

  function generateProfileHTML(profile) {
    let dotsHtml = '';
    for (let i = 1; i <= 5; i++) {
      dotsHtml += `<div class="viz-dot ${i <= profile.rhythmVal ? 'active' : ''}"></div>`;
    }
    
    return `
      <div class="metric-card">
        <div class="metric-name">TEMPO</div>
        <div style="font-size: 1.2rem; font-weight: bold; color: var(--primary); margin: 5px 0;">${profile.bpmBase} BPM</div>
        <div class="metric-desc">Base Rate</div>
      </div>
      <div class="metric-card">
        <div class="metric-name">ENERGY LEVEL</div>
        <div class="metric-bar-bg"><div class="metric-bar-fill" style="width: ${profile.energyVal}%"></div></div>
        <div class="metric-desc">${profile.energyDesc}</div>
      </div>
      <div class="metric-card">
        <div class="metric-name">MOOD TONE</div>
        <div class="slider-bg"><div class="slider-thumb" style="left: ${profile.moodVal}%"></div></div>
        <div class="slider-labels"><span>MELANCHOLIC</span><span>EUPHORIC</span></div>
      </div>
      <div class="metric-card">
        <div class="metric-name">RHYTHM COMPLEXITY</div>
        <div class="dots-container">${dotsHtml}</div>
        <div class="metric-desc">${profile.rhythmDesc}</div>
      </div>
      <div class="metric-card">
        <div class="metric-name">BASS DEPTH</div>
        <div class="metric-bar-bg"><div class="metric-bar-fill" style="width: ${profile.bassVal}%; background: var(--secondary)"></div></div>
        <div class="metric-desc">${profile.bassDesc}</div>
      </div>
      <div class="metric-card">
        <div class="metric-name">MELODIC RANGE</div>
        <div class="waveform-viz-mini">
          <div class="wave-line" style="height: ${Math.max(20, profile.rangeVal)}%"></div>
          <div class="wave-line" style="height: ${Math.max(40, profile.rangeVal)}%"></div>
          <div class="wave-line" style="height: ${Math.max(60, profile.rangeVal)}%"></div>
          <div class="wave-line" style="height: ${Math.max(40, profile.rangeVal)}%"></div>
          <div class="wave-line" style="height: ${Math.max(20, profile.rangeVal)}%"></div>
        </div>
        <div class="metric-desc">${profile.rangeDesc}</div>
      </div>
    `;
  }

  const songMatches = {
    'CHAOS': [
      {t: 'Gasoline', a: 'Halsey', r: "Your high complexity score and explosive energy mirror the controlled chaos in this track. The dense percussion layers match your finger pattern exactly. This song runs at your frequency."},
      {t: 'Voodoo People', a: 'Prodigy', r: "A match for your unpredictable nature. The erratic tempo and aggressive synth lines resonate with your elevated brow score and dynamic facial rhythm."},
      {t: 'HUMBLE', a: 'Kendrick Lamar', r: "Built on heavy, deliberate bass and sharp delivery, this mirrors your grounded mouth width and intense eye openness. It's focused but entirely unrestrained."}
    ],
    'OLD': [
      {t: 'The Night We Met', a: 'Lord Huron', r: "Your warm bass depth and melancholic mood tone resonate with this track's emotional weight. The acoustic simplicity matches your intimate melodic range. Some songs just know."},
      {t: 'Fast Car', a: 'Tracy Chapman', r: "A direct reflection of your subtle energy and calm rhythmic complexity. The steady, repeating guitar loops mirror your relaxed facial ratio and low resting tension."},
      {t: 'Holocene', a: 'Bon Iver', r: "Your extremely low complexity and subtle bass profile align perfectly with this airy, atmospheric masterpiece. It speaks to a face that observes more than it reacts."}
    ],
    'OVERTHINKER': [
      {t: 'Liability', a: 'Lorde', r: "Your tight mouth width and melancholic smile score draw a direct line to this track. The sparse piano and intimate melodic range reflect a frequency built on introspection."},
      {t: 'motion sickness', a: 'Phoebe Bridgers', r: "This matches your moderate rhythm and conflicted mood tone. The steady tempo pairs well with your balanced facial ratio, creating a beat that feels both restless and anchored."},
      {t: 'Breathe (2AM)', a: 'Anna Nalick', r: "A reflection of your high eye openness but low energy. The song's contemplative pacing aligns perfectly with the careful, measured data points extracted from your scan."}
    ],
    'SILENT': [
      {t: 'Redbone', a: 'Childish Gambino', r: "Your grounded energy and deep bass profile call for this heavy, slow-burning groove. The wide facial ratio maps perfectly to the wide stereo field of this track."},
      {t: 'Pursuit of Happiness', a: 'Kid Cudi', r: "Matching your balanced mood and moderate rhythm, this track reflects a steady, internal frequency. Your low brow height translates directly to the song's dry, unfiltered intimacy."},
      {t: 'The Less I Know The Better', a: 'Tame Impala', r: "The driving, iconic bassline perfectly matches the heavy low-end generated by your mouth width. It’s a track that grooves without needing to scream, just like your profile."}
    ],
    'MAIN': [
      {t: 'Levitating', a: 'Dua Lipa', r: "Your euphoric mood tone and high energy score practically demand this track. The bright, flowing melodic range aligns with your wide, open facial structure."},
      {t: 'good 4 u', a: 'Olivia Rodrigo', r: "A perfect mirror for your charged energy and complex rhythmic patterns. Your dynamic eye openness translates directly into the aggressive, punchy hook of this song."},
      {t: 'Heat Waves', a: 'Glass Animals', r: "This matches your warm bass depth and balanced tempo. The smooth, sweeping synthesizers run parallel to your relaxed brow height and subtle facial tension."}
    ],
    'WILDCARD': [
      {t: 'Radioactive', a: 'Imagine Dragons', r: "Your explosive energy and complex finger patterns map directly to the massive, distorted drum loops in this track. It's a frequency built for high impact."},
      {t: 'Mr. Brightside', a: 'The Killers', r: "The frantic, high-tempo energy mirrors your elevated face ratio and euphoric mood score. The relentless rhythm matches the high-tension data points from your scan."},
      {t: 'Supermassive Black Hole', a: 'Muse', r: "A direct match for your heavy bass depth and intricate melodic range. Your wide mouth width drives the heavy, fuzz-laden frequency that powers this entire track."}
    ],
    'PHILOSOPHER': [
      {t: 'Lua', a: 'Bright Eyes', r: "Your minimal rhythm complexity and intimate melodic range pull directly from this bare-bones acoustic frequency. It's a match for a highly relaxed, low-tension profile."},
      {t: 'Re: Stacks', a: 'Bon Iver', r: "The subtle bass and melancholic tone perfectly mirror your facial data. Your low eye openness and steady tempo score align with this track's hypnotic, slow-building nature."},
      {t: 'Skinny Love', a: 'Bon Iver', r: "Your grounded energy and raw, unpolished frequency map directly to this track. The dynamic shifts in your brow height reflect the sudden emotional swells in the music."}
    ],
    'HYPE': [
      {t: 'SICKO MODE', a: 'Travis Scott', r: "Your explosive energy and complex rhythm profile demand this multi-layered, beat-switching track. Your dynamic facial ratio translates into massive, sweeping frequency changes."},
      {t: 'Lose Yourself', a: 'Eminem', r: "The steady, driving tempo aligns perfectly with your grounded but charged energy. Your high finger count maps directly to the intricate, relentless syllabic rhythm."},
      {t: 'Power', a: 'Kanye West', r: "Your wide mouth width and high brow height generate the heavy bass and massive reverb that match this track. It's a high-impact, expansive frequency."}
    ]
  };

  function renderSongMatches(typeId) {
    const songs = songMatches[typeId] || songMatches['CHAOS'];
    let html = '';
    songs.forEach(s => {
      const q = encodeURIComponent(`${s.t} ${s.a}`);
      html += `
        <div class="song-card">
          <div class="song-header">
            <div class="song-info">
              <span class="song-title">${s.t}</span>
              <span class="song-artist">${s.a}</span>
            </div>
          </div>
          <p class="song-reason">${s.r}</p>
          <div class="song-actions">
            <a href="https://open.spotify.com/search/${q}" target="_blank" class="song-btn spotify-btn">SPOTIFY</a>
            <a href="https://www.youtube.com/results?search_query=${q}" target="_blank" class="song-btn youtube-btn">YOUTUBE</a>
          </div>
        </div>
      `;
    });
    document.getElementById('matched-songs-list').innerHTML = html;
    
    let exportHtml = songs.map(s => `<div style="margin:5px 0"><strong style="color:#fff">${s.t}</strong> <span style="color:var(--secondary)">by ${s.a}</span></div>`).join('');
    document.getElementById('export-songs-list').innerHTML = exportHtml;
  }
  
  // Waterfall Canvas Logic
  let wfCanvas, wfCtx, wfLoopId;
  const waterfallParticles = [];
  
  function initWaterfall() {
    wfCanvas = document.getElementById('waterfall-canvas');
    if (!wfCanvas) return;
    wfCtx = wfCanvas.getContext('2d');
    
    const resizeWf = () => {
      const rect = wfCanvas.parentElement.getBoundingClientRect();
      wfCanvas.width = rect.width;
      wfCanvas.height = rect.height;
    };
    window.addEventListener('resize', resizeWf);
    resizeWf();
    
    if (waterfallParticles.length === 0) {
      for (let i = 0; i < 200; i++) {
        waterfallParticles.push({
          x: Math.random() * wfCanvas.width,
          y: Math.random() * wfCanvas.height,
          speed: 1 + Math.random() * 3,
          size: 3 + Math.random() * 3,
          drift: -0.5 + Math.random()
        });
      }
    }
    
    drawWaterfall();
  }
  
  function drawWaterfall() {
    if (!wfCtx) return;
    wfLoopId = requestAnimationFrame(drawWaterfall);
    
    wfCtx.fillStyle = 'rgba(4, 6, 15, 0.2)';
    wfCtx.fillRect(0, 0, wfCanvas.width, wfCanvas.height);
    
    waterfallParticles.forEach(p => {
      p.y += p.speed;
      p.x += p.drift;
      
      if (p.y > wfCanvas.height) {
        p.y = 0;
        p.x = Math.random() * wfCanvas.width;
      }
      
      const hue = (p.y / wfCanvas.height) * 360;
      wfCtx.fillStyle = `hsla(${hue}, 100%, 50%, 0.8)`;
      wfCtx.beginPath();
      wfCtx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      wfCtx.fill();
    });
  }

  function determinePersonality() {
    let score = 0;
    if (scanData.faceRatio > 0.7) score += 1;
    if (scanData.eyeOpenness > 0.05) score += 2;
    if (scanData.browHeight > 0.04) score += 4;
    if (scanData.smileScore > 0.01) score += 1;
    
    const index = score % personalityTypes.length;
    currentPersonality = personalityTypes[index];
    
    const profile = calculateBeatProfile();
    
    document.getElementById('result-metrics-grid').innerHTML = generateProfileHTML(profile);
    document.getElementById('export-metrics-grid').innerHTML = generateProfileHTML(profile);
    
    renderSongMatches(currentPersonality.id);
    
    currentDna = `BEAT:${profile.bpmBase}-${profile.moodDesc.toUpperCase()}-${currentPersonality.id}-${profile.rhythmVal}X`;
    
    document.getElementById('personality-type').innerText = currentPersonality.name;
    document.getElementById('export-personality').innerText = currentPersonality.name;
    document.getElementById('personality-desc').innerText = currentPersonality.desc;
    document.getElementById('dna-code').innerText = currentDna;
    document.getElementById('export-dna-code').innerText = currentDna;
    document.getElementById('player-personality').innerText = currentPersonality.name;
    document.getElementById('bpm-value').innerText = profile.bpmBase;
    
    initWaterfall();
  }

  function runBeatBuildingAnimation() {
    const bars = document.querySelectorAll('.layer-bar');
    let delay = 500;
    
    bars.forEach((bar, i) => {
      setTimeout(() => {
        bar.classList.add('visible');
        setTimeout(() => {
          bar.querySelector('.bar-fill').style.width = '100%';
        }, 100);
      }, delay);
      delay += 800;
    });

    // Flash and cut to feed
    setTimeout(() => {
      const wFlash = document.getElementById('white-flash');
      wFlash.classList.remove('hidden');
      wFlash.classList.add('trigger');
      
      setTimeout(() => {
        switchScreen('feed');
        document.body.classList.add('scrollable');
        wFlash.classList.add('hidden');
        wFlash.classList.remove('trigger');
        bars.forEach(b => {
          b.classList.remove('visible');
          b.querySelector('.bar-fill').style.width = '0';
        });
      }, 200);
    }, delay + 500);
  }

  // Generative Engine
  const pentatonicScale = ['C3', 'D3', 'E3', 'G3', 'A3', 'C4', 'D4', 'E4', 'G4', 'A4'];
  
  const bassPatterns = [
    [0, 8],
    [0, 6, 12],
    [0, 4, 8, 12],
    [0, 3, 6, 8, 11, 14],
    [0, 2, 4, 6, 8, 10, 12, 14]
  ];

  const drumPatterns = [
    { k: [0, 8], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14] },
    { k: [0, 7, 10], s: [4, 12], h: [0, 4, 8, 12] },
    { k: [0, 4, 8, 12], s: [4, 12], h: [2, 6, 10, 14] },
    { k: [0, 9], s: [4, 12], h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
    { k: [0, 3, 8, 11], s: [4, 12, 15], h: [0, 2, 6, 8, 10, 14] }
  ];

  const melodyPatterns = [
    [ {t:0, n:3}, {t:8, n:5} ],
    [ {t:0, n:4}, {t:4, n:5}, {t:8, n:6}, {t:12, n:5} ],
    [ {t:0, n:7}, {t:3, n:6}, {t:6, n:5}, {t:9, n:4}, {t:12, n:3} ],
    [ {t:0, n:5}, {t:2, n:7}, {t:4, n:9}, {t:8, n:7}, {t:10, n:5} ],
    [ {t:0, n:3}, {t:1, n:4}, {t:2, n:5}, {t:8, n:7}, {t:12, n:9}, {t:14, n:8} ]
  ];

  function buildSequence() {
    const bpm = Math.floor(70 + (scanData.faceRatio * 58));
    Tone.Transport.bpm.value = Math.min(128, Math.max(70, bpm));
    
    const browTier = Math.min(4, Math.max(0, Math.floor(scanData.browHeight * 100)));
    reverb.wet.value = Math.min(1, browTier * 0.25);
    
    const smileTier = Math.min(4, Math.max(0, Math.floor(scanData.smileScore * 100)));
    filter.frequency.value = 500 + (smileTier * 1500);
    mainOut.volume.value = -5 + (smileTier * 1.5);
    
    const bassTier = Math.min(4, Math.max(0, Math.floor(scanData.mouthWidth * 50)));
    const bPat = bassPatterns[bassTier] || bassPatterns[0];
    
    const drumTier = Math.min(4, Math.max(0, Math.floor(scanData.fingerCount / 2)));
    const dPat = drumPatterns[drumTier] || drumPatterns[0];
    
    const melTier = Math.min(4, Math.max(0, Math.floor(scanData.eyeOpenness * 100)));
    const mPat = melodyPatterns[melTier] || melodyPatterns[0];
    
    if (sequence) sequence.dispose();
    
    let step = 0;
    sequence = new Tone.Loop((time) => {
      if (dPat.k.includes(step)) kick.triggerAttackRelease("C1", "8n", time);
      if (dPat.s.includes(step)) snare.triggerAttackRelease("16n", time);
      if (dPat.h.includes(step)) hihat.triggerAttackRelease("32n", time, 0.5);
      
      if (bPat.includes(step)) {
        synthBass.triggerAttackRelease(pentatonicScale[0], "8n", time);
      }
      
      const melNote = mPat.find(m => m.t === step);
      if (melNote) {
        synthChord.triggerAttackRelease(pentatonicScale[melNote.n], "16n", time);
      }

      step = (step + 1) % 16;
    }, "16n");
  }

  function drawVisualizer() {
    if (!vizCanvas || !isPlaying) return;
    vizLoopId = requestAnimationFrame(drawVisualizer);
    
    const width = vizCanvas.width;
    const height = vizCanvas.height;
    vizCtx.clearRect(0, 0, width, height);
    
    const values = analyser ? analyser.getValue() : new Float32Array(64).fill(-Infinity);
    const barWidth = width / 32;
    
    for (let i = 0; i < 32; i++) {
      let val = values[i];
      if (!isFinite(val)) val = -100;
      let percent = Math.max(0, (val + 100) / 100); 
      
      if (!analyser || val < -90) {
         percent = 0.05 + Math.sin(Date.now() / 500 + i) * 0.02;
      }
      
      const barHeight = height * 0.6 * percent; 
      const x = i * barWidth;
      const y = height * 0.6 - barHeight;
      
      const grad = vizCtx.createLinearGradient(0, height * 0.6, 0, 0);
      grad.addColorStop(0, '#00ff88');
      grad.addColorStop(1, '#00d4ff');
      
      vizCtx.fillStyle = grad;
      vizCtx.fillRect(x + 1, y, barWidth - 2, barHeight);
      
      const refHeight = barHeight * 0.5;
      vizCtx.fillStyle = 'rgba(0, 255, 136, 0.2)';
      vizCtx.fillRect(x + 1, height * 0.6, barWidth - 2, refHeight);
    }
  }

  function startAudio() {
    Tone.Transport.start();
    sequence.start(0);
    isPlaying = true;
    
    vizCanvas = document.getElementById('visualizer-canvas');
    if (vizCanvas) {
      vizCtx = vizCanvas.getContext('2d');
      const rect = vizCanvas.parentElement.getBoundingClientRect();
      vizCanvas.width = rect.width;
      vizCanvas.height = rect.height || 100;
      drawVisualizer();
    }
  }

  function stopAudio() {
    if (toneSetup) {
      Tone.Transport.stop();
      sequence.stop();
    }
    isPlaying = false;
    if (vizLoopId) cancelAnimationFrame(vizLoopId);
  }

  // Buttons for Feed Screen
  document.getElementById('btn-play-beat').addEventListener('click', () => {
    if (isPlaying) {
      stopAudio();
      document.getElementById('btn-play-beat').innerText = "PLAY BEAT";
    } else {
      buildSequence();
      startAudio();
      document.getElementById('btn-play-beat').innerText = "PAUSE BEAT";
    }
  });

  const resetApp = () => {
    stopAudio();
    document.body.classList.remove('scrollable');
    switchScreen('landing');
  };

  document.getElementById('btn-scan-again-1').addEventListener('click', resetApp);
  
  function copyDnaText(btn) {
    if (!currentDna) return;
    navigator.clipboard.writeText(currentDna);
    const oldText = btn.innerText;
    btn.innerText = "COPIED ✓";
    setTimeout(() => btn.innerText = oldText, 2000);
  }

  const btnCopyDna = document.getElementById('btn-copy-dna');
  if (btnCopyDna) btnCopyDna.addEventListener('click', () => copyDnaText(btnCopyDna));

  const btnShareDna = document.getElementById('btn-share-dna');
  if (btnShareDna) {
    btnShareDna.addEventListener('click', async () => {
      const shareData = {
        title: 'BeatFace',
        text: `I just got my beat analyzed. I'm ${currentPersonality?.name || 'A BEAT'}. My beat DNA: ${currentDna}. Try it yourself: https://beatface.app`
      };
      if (navigator.share) {
        try {
          await navigator.share(shareData);
        } catch (err) { console.error('Share failed', err); }
      } else {
        navigator.clipboard.writeText(shareData.text);
        const old = btnShareDna.innerText;
        btnShareDna.innerText = "COPIED ✓";
        setTimeout(() => btnShareDna.innerText = old, 2000);
      }
    });
  }

  const btnEnterDna = document.getElementById('btn-enter-dna');
  const dnaModal = document.getElementById('dna-modal');
  const dnaInput = document.getElementById('dna-input');
  
  if (btnEnterDna) {
    btnEnterDna.addEventListener('click', () => {
      dnaModal.classList.remove('hidden');
      dnaInput.value = '';
    });
  }
  document.getElementById('btn-close-modal').addEventListener('click', () => {
    dnaModal.classList.add('hidden');
  });

  document.getElementById('btn-load-dna').addEventListener('click', () => {
    const code = dnaInput.value.trim();
    const parts = code.replace('BEAT:', '').split('-');
    if (parts.length >= 4) {
      const [bpm, mood, typeId, comp] = parts;
      currentPersonality = personalityTypes.find(p => p.id === typeId) || personalityTypes[0];
      currentDna = code;
      
      document.getElementById('personality-type').innerText = currentPersonality.name;
      document.getElementById('bpm-value').innerText = bpm;
      document.getElementById('player-personality').innerText = currentPersonality.name;
      
      dnaModal.classList.add('hidden');
      switchScreen('feed');
      document.body.classList.add('scrollable');
      
      scanData = {
        faceRatio: (parseInt(bpm) - 70) / 58,
        eyeOpenness: 0.05,
        browHeight: 0.04,
        mouthWidth: 0.0,
        smileScore: 0.01,
        frownScore: 0,
        fingerCount: parseInt(comp) * 2
      };
      
      const profile = calculateBeatProfile();
      document.getElementById('result-metrics-grid').innerHTML = generateProfileHTML(profile);
      
      buildSequence();
      startAudio();
      document.getElementById('btn-play-beat').innerText = "PAUSE BEAT";
      
      setTimeout(() => document.getElementById('section-player').scrollIntoView(), 100);
    } else {
      alert('Invalid DNA Code');
    }
  });

  const btnSaveCard = document.getElementById('btn-save-card');
  if (btnSaveCard) {
    btnSaveCard.addEventListener('click', () => {
      const oldText = btnSaveCard.innerText;
      btnSaveCard.innerText = "SAVING...";
      const container = document.getElementById('export-container');
      
      html2canvas(document.getElementById('export-card'), {
        backgroundColor: '#04060f',
        scale: 2
      }).then(canvas => {
        btnSaveCard.innerText = oldText;
        const link = document.createElement('a');
        link.download = `beatface-${currentPersonality.id}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      });
    });
  }
});
