import sqlite3

class PDDataBase(object):

	def __init__(self):
		self.conn = sqlite3.connect('sessions.db', check_same_thread=False)
		self.cur = self.conn.cursor()

	def __del__(self):
		self.conn.close()

	def createMainTable(self):
		self.cur.execute("""CREATE TABLE IF NOT EXISTS sessions(
		   sessionid INT PRIMARY KEY,
		   bpm TEXT);
		""")
		self.conn.commit()

	def openSession(self, id):
		self.cur.execute("INSERT INTO sessions VALUES(:id, 0);", {"id": id})
		self.conn.commit()

	def closeSession(self, id):
		self.cur.execute("DELETE FROM sessions WHERE sessionid=:id;", {"id": id})
		self.conn.commit()

	def putBPM(self, bpm, id):
		self.cur.execute("UPDATE sessions SET bpm = :bpm WHERE sessionid = :id;", {"bpm": bpm, "id": id})
		self.conn.commit()

	def getBPM(self, id):
		self.cur.execute("SELECT bpm FROM sessions WHERE sessionid=:id;", {"id": id})
		all_results = self.cur.fetchall()
		return all_results

	def getLastId(self):
		self.cur.execute("SELECT sessionid FROM sessions ORDER BY sessionid DESC LIMIT 1;")
		result = self.cur.fetchone()
		return result