'use strict';
var benchmark = 1;
var xsize = 1000, ysize = 1000;
var canvas = document.getElementById('field');
canvas.width = xsize;
canvas.height = ysize;
var ctx = canvas.getContext('2d');
var img = ctx.createImageData(xsize, ysize);


var room_size_m = 40;
var wavelength_m = 3e8 / 2.4e9;


function pointSource(x0, y0, phase0, power_1m) {
  var buf = new ArrayBuffer(2 * 4 * xsize * ysize);
  var reals = new Float32Array(buf, 0, xsize * ysize);
  var imags = new Float32Array(buf, 4 * xsize * ysize);
  var st = window.performance.now();
if (1) {
  x0 *= xsize;
  y0 *= ysize;
  
  for (var y = 0; y < ysize; y++) {
    var i = y * xsize;
    var dy = (y - y0) * room_size_m / xsize;
    for (var x = 0; x < xsize; x++, i++) {
      var dx = (x - x0) * room_size_m / ysize;
      var r2 = dy*dy + dx*dx;
      var r = Math.sqrt(r2);
      var phase = phase0 + r / wavelength_m;
      var gain = power_1m / r2;
      reals[i] = gain * Math.cos(phase);
      imags[i] = gain * Math.sin(phase);
    }
  }
  if (benchmark) console.debug('pointSource:', window.performance.now() - st);
}
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
  var numareas = 0;
  for (var ai = 0; ai < areas.length; ai++) {
    if (areas[ai]) numareas++;
  }
  var regulatory_factor = 1 / Math.sqrt(numareas);  
  
  var st = window.performance.now();
if (1) {
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
}
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
if (1) {
  for (var i = 0; i < reals.length; i++) {
    var real = reals[i], imag = imags[i];
    var gain = Math.sqrt(real*real + imag*imag);
    // scale is an arbitrary transformation to try to make the best use
    // of the available colour brightness map.
    var scale = Math.sqrt(gain);
    
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
}
  ctx.putImageData(img, 0, 0);
  
  var ptx = 0.6 * xsize, pty = 0.6 * ysize;
  var pti = pty * xsize + ptx;
  ctx.strokeStyle = 'white';
  ctx.ellipse(ptx, pty, xsize/100, ysize/100, 0, Math.PI*2, 0);
  ctx.stroke();
  var ptgain2 = (area.reals[pti]*area.reals[pti] +
		 area.imags[pti]*area.imags[pti]);
  console.debug("power at point:", 10 * Math.log(ptgain2, 10));
  
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
var rendering = 0;
var movewhich = 0;

document.body.onkeypress = function(e) {
  if (e.charCode >= 0x31 && e.charCode <= 0x39) {
    movewhich = e.charCode - 0x31;
    if (areas[movewhich]) {
      areas[movewhich] = undefined;
    } else {
      if (!sources[movewhich]) {
	sources[movewhich] = {
          x: 0.3,
	  y: 0.3 + wavelength_m/room_size_m*8/2*movewhich, 
	  phase: 0,
	  gain: 1
	};
      }
      renderPointSource(movewhich);
    }
    render();
  }
}

canvas.onmousemove = function(e) {
  if (rendering) {
    var s = sources[movewhich];
    s.x = e.x / canvas.clientWidth;
    s.y = e.y / canvas.clientHeight;
    renderPointSource(movewhich);
    render();
  }
}

canvas.onmousedown = function(e) {
  rendering = 1;
  canvas.onmousemove(e);
}

canvas.onmouseup = function(e) {
  rendering = 0;
}

canvas.onmousewheel = function(e) {
  sources[movewhich].phase += e.wheelDeltaX / 500 * Math.PI;
  renderPointSource(movewhich);
  render();
}

