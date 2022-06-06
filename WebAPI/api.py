from flask import Flask, jsonify, request
from flask_restful import Api, Resource, reqparse
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from PDDB import PDDataBase
import datetime
import socket
import sys

app = Flask(__name__)
cors = CORS(app)
api = Api(app)
db = PDDataBase()
db.createMainTable()

class Session(Resource):
    def get(self):
        id = db.getLastId()
        if id == None:
            id = 0
        else:
            id = id[0] + 1
        db.openSession(id)
        return id, 200

class SendBPM(Resource):
    def post(self, id=-1):
        if id == -1:
            return "Not found", 404
        json_data = request.get_json(force=True)
        bpm = json_data['bpm']
        db.putBPM(bpm, id)
        return "All good", 200

class GetBPM(Resource):
    def get(self, id=-1):
        if id == -1:
            return "Not found", 404
        return db.getBPM(id), 200

class CloseSession(Resource):
    def get(self, id=-1):
        if id == -1:
            return "Not found", 404
        db.closeSession(id)
        return "Close session: " + str(id), 200

api.add_resource(Session, "/new_session")
api.add_resource(SendBPM, "/send_bpm/<int:id>")
api.add_resource(GetBPM, "/get_bpm/<int:id>")
api.add_resource(CloseSession, "/close_session/<int:id>")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int("5003"), debug=True)










