from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, unquote
import argparse
import json
parser = argparse.ArgumentParser(description='Local production-build fault injection; no app code injection.')
parser.add_argument('--port', type=int, default=5178)
parser.add_argument('--control', default='/tmp/bess-fault-mode.json')
parser.add_argument('--log', default='/tmp/bess-fault-requests.jsonl')
args = parser.parse_args()
root=Path(__file__).resolve().parents[3] / 'dist'
control=Path(args.control)
log=Path(args.log)
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        self.request_path = self.path
        path=unquote(urlsplit(self.path).path)
        if not path.startswith('/BESS-Storage-Simulator/'):
            self.send_error(404);return
        rel=path.removeprefix('/BESS-Storage-Simulator/') or 'index.html'
        mode=json.loads(control.read_text()) if control.exists() else {}
        should_fail=bool(mode.get('fail') and mode['fail'] in rel)
        if should_fail:
            self.send_response(503);self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(b'Injected transient failure');return
        self.path='/'+rel
        super().do_GET()
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(root),**kwargs)
    def log_request(self,code='-',size='-'):
        with log.open('a') as f: f.write(json.dumps({'path':self.request_path,'status':code})+'\n')
    def log_message(self,*args): pass
print(f'Serving {root} on http://127.0.0.1:{args.port}/BESS-Storage-Simulator/',flush=True)
ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
