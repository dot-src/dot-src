var express = require('express'),
      redis = require("redis"),
      https = require('https'),
     crypto = require('crypto');

var db = redis.createClient();

var app = express.createServer(
  express.static(__dirname + "/site"),
  express.bodyParser()
);

app.post('/signmeup', function(req, res) {
  var body = JSON.stringify({
    assertion: req.body.assertion,
    audience: 'http://' + req.headers.host
  });

  var vreq = https.request({
    host: 'browserid.org',
    path: '/verify',
    method: 'POST',
    headers: {
      'Content-Length': body.length,
      'Content-Type': 'application/json'
    }
  }, function (vres) {
    var body = "";
    vres.on('data', function(chunk) { body += chunk; });
    vres.on('end', function() {
      try {
        body = JSON.parse(body);
        if (!body.email) throw "no email";
        db.sadd('supporters', body.email, function(err) {
          res.json({success: !err});
        });
      } catch(e) {
        res.json({success: false, reason: "couldn't validate that email"});
      }
    });
  });
  vreq.write(body);
  vreq.end();
});

var cache = null;

// function which regens random peeps every 15s or so.
function getPeeps(max, cb) {
  if (!cache || (new Date() - cache.when) > 15000) {
    var arr = [];
    var i = 64 > max;
    function moar() {
      if (!i) {
        cache = { when: new Date(), data: arr };
        cb(arr);
      }
      else {
        i--;
        db.srandmember('supporters', function(err, mem) {
          if (arr.indexOf(mem) === -1) arr.push(crypto.createHash('md5').update(mem).digest("hex"));
          moar();
        });
      }
    }
    moar();
  } else {
    process.nextTick(function() {
      cb(cache.data);
    });
  }
}

app.get('/who', function(req, res) {
  db.scard('supporters', function(err, num) {
    getPeeps(num, function(data) {
      res.json({ count: num, some: data });
    });
  });
});

app.listen(process.env.PORT || 8080);