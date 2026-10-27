"""Validate the public, AI-maintained project feed before generating pages."""
import json
import re
from datetime import date, datetime
from pathlib import Path

GROUPS={
    'offline': {'offline','offline-board','pos'},
    'letter': {'letter','season-letter'},
    'mall': {'mall'},
    'smartstore': {'smartstore'},
    'coupang': {'coupang','coupang-ads'},
    'product': {'sourcing','inventory','photo','detail-v2'},
    'marketing': {'kakao','instagram','naver-ads','analytics'},
    'finance': {'finance','hyundai','ledger-ai','hometax-clove','private-settlement'},
    'brand': {'brand'},
    'support': {'support'},
    'ops': {'patrol','letter-push','legacy-rd'},
}

def check(path):
    d=json.loads(Path(path).read_text(encoding='utf-8'))
    assert set(d)=={'schemaVersion','updatedAt','checkedAt','staleAfterDays','openingDate','note','projects','milestones','agents','automation'}, 'unexpected root fields'
    assert d['schemaVersion']==1 and d['staleAfterDays']==7
    checked=date.fromisoformat(d['checkedAt'])
    assert datetime.fromisoformat(d['updatedAt']).utcoffset().total_seconds()==32400
    date.fromisoformat(d['openingDate'])
    ids=set()
    members=set()
    assert len(d['projects'])==11, 'only the 11 approved major projects are allowed'
    allowed={'id','name','includes','includesLabel','stage','stages','state','status','next','owners','blocked','lastActivity','automation','evidence','href','tone'}
    for p in d['projects']:
        assert set(p)==allowed, 'unexpected project fields'
        assert re.fullmatch('[a-z0-9-]+',p['id']) and p['id'] not in ids
        ids.add(p['id'])
        assert p['id'] in GROUPS, 'new major projects require owner approval'
        assert isinstance(p['includes'],list) and p['includes'], 'includes must list subwork IDs'
        assert all(isinstance(x,str) and re.fullmatch('[a-z0-9-]+',x) for x in p['includes'])
        included=set(p['includes'])
        assert len(included)==len(p['includes']) and not members.intersection(included), 'duplicate includes'
        assert GROUPS[p['id']]<=included, 'required legacy IDs must remain in their approved major project'
        assert 'buttermilk' not in included, 'reference books are not projects'
        assert not (set(GROUPS)-{p['id']}).intersection(included), 'major project cannot be nested under another'
        members.update(included)
        assert isinstance(p['includesLabel'],str) and p['includesLabel'].strip() and '\n' not in p['includesLabel']
        assert type(p['stage']) is int and 0<=p['stage']<=5
        assert len(p['stages'])==5 and all(isinstance(x,str) and x for x in p['stages'])
        assert p['state'] in {'active','waiting','paused','unknown','done'}
        assert p['tone'] in {'green','amber','red'}
        assert p['owners'] and set(p['owners'])<={'현수','다희','AI'}
        assert all(isinstance(p[k],str) for k in ['name','status','next','blocked','automation','evidence','href'])
        assert p['lastActivity'] is None or date.fromisoformat(p['lastActivity'])<=checked
        assert re.match(r'^(https://|[a-z][a-z0-9-]*\.html(?:[?#].*)?$)',p['href'])
    assert d['projects'] and d['milestones'] and d['agents']
    assert ids==set(GROUPS), 'approved major project list changed'
    for m in d['milestones']:
        assert set(m)=={'date','label','kind'} and m['kind'] in {'confirmed','proposed','previous'}
        date.fromisoformat(m['date'])
    for a in d['agents']:
        assert set(a)=={'name','doing','tone'} and a['tone'] in {'green','amber','red'}
    assert set(d['automation'])=={'schedule','status','lastVerifiedRun'}
    # No private source links, finance fields, credentials or customer/contact data.
    text=json.dumps(d,ensure_ascii=False)
    assert not re.search(r'drive\.google|docs\.google|script\.google|@|AIza|sk-proj|private_key|token|계좌번호|승인번호|원가|마진|\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b',text,re.I)
    return len(ids)

if __name__=='__main__':
    print(f'PASS {check(Path(__file__).parent / "src/project-progress.json")} public projects')
