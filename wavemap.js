'use strict';
var benchmark = 0;
var room_size_m = 10;
var base_power_1m = 0.001;  // RSSI (mW) at 1m distance from tx
var base_gain_1m = Math.sqrt(base_power_1m);
var wavelength_m = 3e8 / 2.4e9;
var xsize = 1000, ysize = 1000;
var rx_x = 0.6, rx_y = 0.6

var canvas = document.getElementById('field');
canvas.width = xsize;
canvas.height = ysize;
var ctx = canvas.getContext('2d');
var img = ctx.createImageData(xsize, ysize);


// cos() lookup table (for speed)
var cosa_scale = 8192;
var cosa_wrap = (cosa_scale * wavelength_m) | 0;
var sina_ofs = cosa_wrap >> 2;
var cosa_size = cosa_wrap + sina_ofs;
var cos_approx = new Float32Array(cosa_size);
for (var cosi = 0; cosi < cosa_size; cosi++) {
  cos_approx[cosi] = Math.cos(cosi * Math.PI * 2 / cosa_wrap);
}


function getMag(real, imag) {
  return Math.sqrt(real*real + imag*imag);
}


function getPhase(real, imag) {
  return Math.atan2(imag, real);
}


function pointSource(x0, y0, phase0, gain_1m) {
  var buf = new ArrayBuffer(2 * 4 * xsize * ysize);
  var reals = new Float32Array(buf, 0, xsize * ysize);
  var imags = new Float32Array(buf, 4 * xsize * ysize);
  var gains = new Float32Array(xsize * ysize);
  var phases = new Uint32Array(xsize * ysize);
  var st = window.performance.now();

  phase0 = phase0 * wavelength_m / Math.PI / 2;
  x0 *= xsize;
  y0 *= ysize;
  var y_hop = room_size_m / xsize;
  var x_hop = room_size_m / ysize;
  var x_hop2 = x_hop * x_hop;
  
  var dy = -y0 * y_hop;
  var i = 0;
  for (var y = 0; y < ysize; y++) {
    var dx = -x0 * x_hop;
    for (var x = 0; x < xsize; x++, i++) {
      var r2 = dy*dy + dx*dx;
      var r = Math.sqrt(r2);
      var phase = phase0 + r;
      gains[i] = base_gain_1m * gain_1m / r2;
      phases[i] = (phase * cosa_scale) % cosa_wrap;
      dx += x_hop;
    }
    dy += y_hop;
  }
  
  for (var i = 0; i < gains.length; i++) {
    var gain = gains[i];
    var phase = phases[i];
    reals[i] = gain * cos_approx[phase];
    imags[i] = gain * -cos_approx[phase + sina_ofs];
  }

  if (benchmark) console.debug('pointSource:', window.performance.now() - st);
  return { reals: reals, imags: imags };
}


function addAreas(areas) {
  var buf = new ArrayBuffer(2 * 4 * xsize * ysize);
  var reals = new Float32Array(buf, 0, xsize * ysize);
  var imags = new Float32Array(buf, 4 * xsize * ysize);

  // We have to reduce the gain from each transmitter so total output
  // power stays within regulatory limits.  'gain' is the wave
  // amplitude, so power is the sqrt of that, and power is what's
  // regulated.  So we divide by the sqrt of the number of signals.
  // 
  // FCC says we have to *additionally* reduce the transmit power by
  // 1dB for each 3dB of antenna gain over 6dBi.  Our simulation uses
  // ideal isotropic antennas (0dBi) but the beamforming gain is
  // 10*log10(numareas).  (Again here, that limit is on power, not
  // amplitude, so take the sqrt.)
  // 
  // TODO(apenwarr): not sure if these rules are the same for 5 GHz band.
  var numareas = 0;
  for (var ai = 0; ai < areas.length; ai++) {
    if (areas[ai]) numareas++;
  }
  // we use 0dBi antennas, but "better" ones are more realistic, and punish
  // us more for FCC purposes, so be conservative here.
  var assumed_ant_gain = 6;
  var ant_gain_db = assumed_ant_gain + 10*Math.log(numareas)/Math.log(10);
  var ant_excess_db = ant_gain_db > 6 ? ant_gain_db - 6 : 0;
  var fcc_array_factor = Math.sqrt(Math.pow(10, -ant_excess_db/3/10));
  var fcc_per_ant_factor = 1 / Math.sqrt(numareas)
  var regulatory_factor = fcc_per_ant_factor * fcc_array_factor;
  console.debug('regulatory factor:', regulatory_factor,
		'per_ant factor:', fcc_per_ant_factor,
		'array factor:', fcc_array_factor);
  
  var st = window.performance.now();
  for (var ai = 0; ai < areas.length; ai++) {
    var a = areas[ai];
    if (!a) continue;
    for (var i = 0; i < a.reals.length; i++) {
      reals[i] += a.reals[i] * regulatory_factor;
    }
    for (var i = 0; i < a.imags.length; i++) {
      imags[i] += a.imags[i] * regulatory_factor;
    }
  }
  if (benchmark) console.debug('addAreas:', window.performance.now() - st);
  return { reals: reals, imags: imags };
}


var sources = [{x:0.3, y:0.3, phase:0, gain:1},
	       {x:0.3, y:0.3 + wavelength_m/room_size_m*7/2, phase:0, gain:1},
	       {x:0.3 + wavelength_m/room_size_m*7/2, y:0.3, phase:0, gain:1}];
var areas = [];
var area;


function renderPointSource(i) {
  var s = sources[i];
  areas[i] = pointSource(s.x, s.y, s.phase, s.gain);
}


for (var i = 0; i < sources.length; i++) {
  renderPointSource(i);
}


function render() {
  area = addAreas(areas);
  var reals = area.reals;
  var imags = area.imags;
  var st = window.performance.now();
  for (var i = 0; i < reals.length; i++) {
    var real = reals[i], imag = imags[i];
    var gain = Math.sqrt(real*real + imag*imag);
    // scale is an arbitrary transformation to try to make the best use
    // of the available colour brightness map.
    var scale = Math.sqrt(gain / base_gain_1m);
    
    var v = 256 * scale;
    if (real >= 0) {
      // negative amplitude
      img.data[4*i + 0] = v;
      img.data[4*i + 1] = v >> 2;
      img.data[4*i + 2] = v >> 2;
      img.data[4*i + 3] = 255;
    } else {
      // positive amplitude
      var v = 256 * scale;
      img.data[4*i + 0] = 0;
      img.data[4*i + 1] = v >> 1;
      img.data[4*i + 2] = v >> 0;
      img.data[4*i + 3] = 255;
    }
  }
  if (benchmark) console.debug('copy time:', window.performance.now() - st);
  ctx.putImageData(img, 0, 0);
  
  var ptx = (rx_x * xsize) | 0, pty = (rx_y * ysize) | 0;
  var pti = pty * xsize + ptx;
  ctx.beginPath();
  ctx.strokeStyle = 'white';
  ctx.ellipse(ptx, pty, xsize/100, ysize/100, 0, Math.PI*2, 0);
  ctx.stroke();
  var ptgain2 = (area.reals[pti]*area.reals[pti] +
		 area.imags[pti]*area.imags[pti]);
  console.debug('power at point:', ptgain2, '=',
		10 * Math.log(ptgain2)/Math.log(10), 'dBm');
  
  ctx.beginPath();
  ctx.strokeStyle = '#0c0';
  ctx.textAlign = 'center';
  ctx.shadowOffsetX = -1;
  ctx.shadowColor = 'black';
  for (var i = 0; i < sources.length; i++) {
    if (!areas[i]) continue;
    ctx.strokeText(i+1, sources[i].x * xsize, sources[i].y * ysize);
  }
}

render();
var moving = 0;
var movewhich = 0;


function beamform_optimize() {
  // optimize beamforming for receiver.  We want to zero out all the
  // phases at the target point.
  var ptx = (rx_x * xsize) | 0, pty = (rx_y * ysize) | 0;
  var pti = pty * xsize + ptx;
  for (var ai = 0; ai < areas.length; ai++) {
    var s = sources[ai];
    var a = areas[ai];
    if (!a || !s) continue;
    var current_phase = getPhase(a.reals[pti], a.imags[pti]);
    s.phase -= current_phase;
    while (s.phase < 0) s.phase += 2 * Math.PI;
    renderPointSource(ai);
  }
}


document.body.onkeypress = function(e) {
  var c = String.fromCharCode(e.charCode);
  if (e.charCode >= 0x31 && e.charCode <= 0x39) {
    // number key
    movewhich = e.charCode - 0x31;
    if (areas[movewhich]) {
      areas[movewhich] = undefined;
    } else {
      if (!sources[movewhich]) {
	sources[movewhich] = {
          x: 0.3,
	  y: 0.3 + wavelength_m/room_size_m*3/2*movewhich, 
	  phase: 0,
	  gain: 1
	};
      }
      renderPointSource(movewhich);
    }
    render();
  } else if (c == 'r') {
    movewhich = 'r';
  } else if (c == 'o') {
    beamform_optimize();
    render();
  } else if (c == 'O') {
    // optimize *against* the receiver: try to make it so the receiver
    // can't hear us at all by causing negative interference at his
    // location.
    //
    // To make this work, we need to divide the signals up into "positive"
    // and "negative" bins, where each bin contains roughly the same
    // magnitude.  Then one gets phase 0 and one gets phase pi (ie. inverted)
    // for maximum interference.  I'm sure there's some kind of efficient
    // bin-packing algorithm for this, but there are only at most 9
    // transmitters, so let's just brute force it.
    // 
    // In theory we could also fiddle with transmit power on each antenna
    // to try to get a more perfect match.  But that's complicated.
    // 
    // FIXME: I think there's probably a better way to do this by being
    // more flexible about the angles, rather than just limiting to 0 and pi.
    // (I know this because 'randomize' sometimes gives even better results :))
    var ptx = (rx_x * xsize) | 0, pty = (rx_y * ysize) | 0;
    var pti = pty * xsize + ptx;
    
    var getBinMag = function(binbits) {
      var mag = 0;
      for (var bit = 0; bit < areas.length; bit++) {
	var a = areas[bit];
	if (!a) continue;
	if (binbits & (1 << bit)) {
	  mag += getMag(a.reals[pti], a.imags[pti]);
	}
      }
      return mag;
    }
    
    var best = 0, bestmag = 0, maxmag = getBinMag((1 << areas.length) - 1);
    for (var binbits = 0; binbits < (1 << areas.length); binbits++) {
      var mag = getBinMag(binbits);
      if (mag < maxmag/2 && mag > bestmag) {
	bestmag = mag;
	best = binbits;
      }
    }
    
    console.debug('anti-optimize: bestmag:', bestmag, 'maxmag:', maxmag);
    
    for (var bit = 0; bit < areas.length; bit++) {
      var s = sources[bit];
      var a = areas[bit];
      if (!a) continue;
      var current_phase = getPhase(a.reals[pti], a.imags[pti]);
      if (best & (1 << bit)) {
	s.phase -= current_phase;
      } else {
	s.phase -= current_phase - Math.PI;
      }
      renderPointSource(bit);
    }
    render();
  } else if (c == 'x') {
    // randomize transmitter phases.
    for (var ai = 0; ai < areas.length; ai++) {
      var s = sources[ai];
      var a = areas[ai];
      if (!a) continue;
      s.phase = Math.random() * Math.PI * 2;
      renderPointSource(ai);
    }
    render();
  }
}

canvas.onmousemove = function(e) {
  var mousex_frac = e.x / canvas.clientWidth;
  var mousey_frac = e.y / canvas.clientHeight;
  if (moving) {
    if (movewhich == 'r') {
      rx_x = mousex_frac;
      rx_y = mousey_frac;
      beamform_optimize();
    } else {
      var s = sources[movewhich];
      s.x = mousex_frac;
      s.y = mousey_frac;
      renderPointSource(movewhich);
    }
    render();
  }
}

canvas.onmousedown = function(e) {
  moving = 1;
  canvas.onmousemove(e);
}

canvas.onmouseup = function(e) {
  moving = 0;
}

canvas.onmousewheel = function(e) {
  if (sources[movewhich]) {
    sources[movewhich].phase += e.wheelDeltaX / 500 * Math.PI;
    renderPointSource(movewhich);
  }
  render();
}
