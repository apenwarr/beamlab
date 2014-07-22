'use strict';

var pluscolor = new Uint8ClampedArray([0,128,255,255]);
var minuscolor = new Uint8ClampedArray([255,64,64,255]);

var xsize = 400, ysize = 400;
var canvas = document.getElementById('field');
canvas.width = xsize;
canvas.height = ysize;
var ctx = canvas.getContext('2d');
var img = ctx.createImageData(xsize, ysize);


var room_size_m = 40;
var wavelength_m = 3e8 / 2.4e9;


function pointSource(x0, y0, phase0, power_1m) {
  var buf = new ArrayBuffer(2 * 4 * xsize * ysize);
  var gains = new Float32Array(buf, 0, xsize * ysize);
  var phases = new Float32Array(buf, 4 * xsize * ysize);
  
  x0 *= xsize;
  y0 *= ysize;

  for (var i = 0; i < gains.length; i++) {
    var y = i / xsize;
    var x = i % xsize;
    var dy = (y - y0) * room_size_m / xsize;
    var dx = (x - x0) * room_size_m / ysize;
    var r = Math.sqrt(dy*dy + dx*dx);
    phases[i] = (phase0 + r / wavelength_m) % (2 * Math.PI);
    gains[i] = power_1m / (r * r);
  }
  return { gains: gains, phases: phases };
}


function addAreas(areas) {
  var buf = new ArrayBuffer(2 * 4 * xsize * ysize);
  var gains = new Float32Array(buf, 0, xsize * ysize);
  var phases = new Float32Array(buf, 4 * xsize * ysize);
  
  var numareas = 0;
  for (var ai = 0; ai < areas.length; ai++) {
    if (areas[ai]) numareas++;
  }

  for (var ai = 0; ai < areas.length; ai++) {
    var a = areas[ai];
    if (!a) continue;
    for (var i = 0; i < a.gains.length; i++) {
      // We have to reduce the gain from each transmitter so total output
      // power stays within regulatory limits.  'gain' is the wave
      // amplitude, so power is the sqrt of that, and power is what's
      // regulated.  So we divide by the sqrt of the number of signals.
      var addgain = a.gains[i] / Math.sqrt(numareas);
      var x = gains[i]*Math.cos(phases[i]) + addgain*Math.cos(a.phases[i]);
      var y = gains[i]*Math.sin(phases[i]) + addgain*Math.sin(a.phases[i]);
      gains[i] = Math.sqrt(x*x + y*y);
      phases[i] = Math.atan2(y, x);
      if (phases[i] < 0) phases[i] += 2 * Math.PI;
    }
  }
  return { gains: gains, phases: phases };
}


function setPix(img, i, val) {
  if (val >= 0) {
    var c = pluscolor;
  } else {
    var c = minuscolor;
    val = -val;
  }
  var scale = Math.pow(val, 0.5);
  for (var j = 0; j < 3; j++) {
    img.data[4*i + j] = c[j] * scale;
  }
  img.data[4*i + 3] = 255;
}


var sources = [[0.3, 0.3, 0, 1],
	       [0.3, 0.3 + wavelength_m/room_size_m*7/2, 0, 1],
	       [0.3 + wavelength_m/room_size_m*7/2, 0.3, 0, 1]];
var areas = [];
var area;


function renderPoint(i) {
  var s = sources[i];
  areas[i] = pointSource(s[0], s[1], s[2], s[3]);
}


for (var i = 0; i < sources.length; i++) {
  renderPoint(i);
}

function render() {
  area = addAreas(areas);

  for (var i = 0; i < area.gains.length; i++) {
    var sgn = (area.phases[i] > Math.PI/2 && area.phases[i] < Math.PI*3/2) ?
	-1 : 1;
    setPix(img, i, area.gains[i] * sgn);
  }
  ctx.putImageData(img, 0, 0);
  
  var ptx = 0.6 * xsize, pty = 0.6 * ysize;
  var pti = pty * xsize + ptx;
  ctx.strokeStyle = 'white';
  ctx.ellipse(ptx, pty, xsize/100, ysize/100, 0, Math.PI*2, 0);
  ctx.stroke();
  console.debug("power at point:", 
		10 * Math.log(Math.pow(area.gains[pti], 2),10));
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
	sources[movewhich] = [0.3, 0.3 + wavelength_m/room_size_m*8/2*movewhich, 
			      0, 1];
      }
      renderPoint(movewhich);
    }
    render();
  }
}

canvas.onmousemove = function(e) {
  if (rendering) {
    var s = sources[movewhich];
    s[0] = e.x / canvas.clientWidth;
    s[1] = e.y / canvas.clientHeight;
    renderPoint(movewhich);
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
  sources[movewhich][2] += e.wheelDeltaX / 500 * Math.PI;
  renderPoint(movewhich);
  render();
}

