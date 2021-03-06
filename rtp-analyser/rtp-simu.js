"use strict";
exports.__esModule = true;
var dgram = require("dgram");
var RESET_INTERVAL = 2;
var RTPReceiver = /** @class */ (function () {
    function RTPReceiver(maddress, port, PT) {
        var _this = this;
        var my_this = this;
        this._maddress = maddress;
        this._port = port;
        this.SSRC = -1;
        this.expectedPayloadType = PT;
        this.maxInterval = 0;
        this.meanInterval = BigInt(0);
        this.meanCount = 0;
        this.lastRcvTime = BigInt(0);
        this.errors = [];
        this.errorDesc = [
            "ok",
            "init",
            "bad SSRC",
            "bad Payload Type",
            "out of order packets",
            "late packets",
            'too much droped packets'
        ];
        console.log("Listening to stream: " + maddress + ":" + port);
        this._sender1 = dgram.createSocket({ type: "udp4", reuseAddr: true });
        this._sender1.bind();
        this._sender2 = dgram.createSocket({ type: "udp4", reuseAddr: true });
        this._sender2.bind();
        this._socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
        this._socket.bind(port);
        console.log("Sock is listening");
        this._socket.on("listening", function () {
            _this._socket.addMembership(maddress);
            _this._sender1.addMembership('239.67.67.1');
            _this._sender2.addMembership('239.67.67.2');
            var address = _this._socket.address();
            console.log("Sock is listening : " + JSON.stringify(address));
            _this._socket.on("message", function (message, rinfo) {
                var t = process.hrtime.bigint();
                // Analysing packet
                var data = {
                    SSRC: message.readUInt32BE(8),
                    Seqnum: message.readUInt16BE(2),
                    TS: message.readUInt32BE(4),
                    RcvTime: t,
                    payloadType: message.readUInt8(1) & 0x7f
                };
                my_this.update(my_this.newPacket(data));
                if (((parseInt('0000000011000000', 2) & data.Seqnum) ^ parseInt('0000000000000000', 2)))
                    my_this._sender1.send(message, 0, message.length, 5004, '239.67.67.1');
                if (((parseInt('0000000011000000', 2) & data.Seqnum) ^ parseInt('0000000011000000', 2)))
                    my_this._sender2.send(message, 0, message.length, 5004, '239.67.67.2');
                //console.log("Pack : " + _this.maxInterval/1000000000) 
            });
        });
    }
    RTPReceiver.prototype.reset = function () {
        this.SSRC = -1;
    };
    RTPReceiver.prototype.getInfos = function () {
        var data = {
            expectedPayloadType: this.expectedPayloadType,
            maddress: this._maddress,
            port: this._port,
            maxIntervalS: this.maxInterval / 1000000000,
            meanInterval: Number(this.meanInterval) / this.meanCount / 1000000000,
            lastSeen: Number(this.lastRcvTime - process.hrtime.bigint()) / 1000000000,
            errors: this.errors,
            SSRC: this.SSRC.toString(16).padStart(8, "0"),
            now: Date.now()
        };
        this.meanInterval = BigInt(0);
        this.maxInterval *= 0.9;
        this.meanCount = 0;
        return data;
    };
    RTPReceiver.prototype.update = function (num) {
        if (num == 1) {
        }
        else if (num > 1) {
            if (!this.errors[num]) {
                this.errors[num] = {
                    last: Date.now(),
                    info: this.errorDesc[num]
                };
            }
            this.errors[num].last = Date.now();
        }
    };
    /*
    * Data is
    * {
    *  SSRC
    *  Seqnum
    *  TS
    *  RcvTime
    *  payloadType
    * }
    */
    RTPReceiver.prototype.newPacket = function (data) {
        if (this.SSRC == -1) {
            this.SSRC = data.SSRC;
            this.lastSeenSeq = data.Seqnum;
            this.lastSeenTS = data.TS;
            this.lastRcvTime = data.RcvTime;
            return 1;
        }
        else {
            if (this.SSRC != data.SSRC) {
                //console.log("Seen wrong SSRC")
                return 2;
            }
            if (this.expectedPayloadType != data.payloadType) {
                //console.log("Wrong payload type " + data.payloadType + " should be " +  this.expectedPayloadType)
                return 3;
            }
            var nextSeq = (this.lastSeenSeq + 1) % 65536;
            if (nextSeq == data.Seqnum) {
                // All ok
                var interval = data.RcvTime - this.lastRcvTime;
                this.lastRcvTime = data.RcvTime;
                if (interval > this.maxInterval)
                    this.maxInterval = Number(interval);
                this.meanInterval += BigInt(interval);
                this.meanCount++;
                this.lastSeenTS = data.TS;
                this.lastSeenSeq = nextSeq;
                return 0;
            }
            if (data.Seqnum > nextSeq) {
                if (data.Seqnum - nextSeq > RESET_INTERVAL) {
                    console.log("Too many dropped packets, reseting");
                    this.reset();
                    return 6 * this.newPacket(data);
                }
                console.log("Out of order packet");
                this.lastRcvTime = data.RcvTime;
                this.lastSeenTS = data.TS;
                this.lastSeenSeq = data.Seqnum;
                return 4;
            }
            if (data.Seqnum < nextSeq) {
                console.log("Late packet");
                return 5;
            }
        }
    };
    return RTPReceiver;
}());
exports.RTPReceiver = RTPReceiver;
