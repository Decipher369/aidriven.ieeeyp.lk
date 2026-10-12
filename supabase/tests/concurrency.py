"""Disposable database tests using psql sessions; never run on production."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
import subprocess
import threading
import time
import uuid


def sql(statement, actor=None, fail=True):
    prefix = ""
    if actor:
        prefix = f"SET LOCAL ROLE authenticated; SET LOCAL \"request.jwt.claim.sub\" = '{actor}';"
    result = subprocess.run(
        ["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
        input=f"BEGIN; {prefix} {statement} COMMIT;",
        text=True, capture_output=True, env=os.environ, timeout=30,
    )
    if fail and result.returncode:
        raise RuntimeError(result.stderr)
    return result


def buy(actor, ticket_type):
    return sql(f"SELECT public.create_order('{ticket_type}', '[]');", actor, False)


def pair(tasks):
    gate = threading.Barrier(2)
    def start(task):
        gate.wait(timeout=10)
        return task()
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(start, task) for task in tasks]
        return [future.result() for future in futures]


def passed(label):
    print(f"PASS: {label}", flush=True)


admin = str(uuid.uuid4())
delegates = [str(uuid.uuid4()) for _ in range(53)]
last_type, same_type, load_type = [str(uuid.uuid4()) for _ in range(3)]
values = ",".join(
    f"('{user}','concurrency-{user}@example.invalid','{{\"full_name\":\"Load Delegate {index}\",\"phone\":\"0700000000\",\"institution\":\"Local test\"}}'::jsonb)"
    for index, user in enumerate(delegates)
)
sql(f"""
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES {values};
INSERT INTO auth.users(id,email,raw_app_meta_data)
 VALUES ('{admin}','concurrency-admin@example.invalid','{{"registration_admin":true}}');
INSERT INTO public.admins(user_id,full_name) VALUES ('{admin}','Concurrency Admin');
INSERT INTO public.ticket_types(id,name,price,capacity,active) VALUES
 ('{last_type}','CONCURRENCY LAST SEAT',100,1,true),
 ('{same_type}','CONCURRENCY SAME DELEGATE',100,10,true),
 ('{load_type}','CONCURRENCY LOAD',100,50,true);
""")

results = pair([lambda: buy(delegates[0], last_type), lambda: buy(delegates[1], last_type)])
assert sum(result.returncode == 0 for result in results) == 1, [result.stderr for result in results]
winner = delegates[0] if results[0].returncode == 0 else delegates[1]
winning_order = next(result.stdout.strip() for result in results if result.returncode == 0)
passed("two delegates buying the last seat: exactly one succeeds")

results = pair([lambda: buy(delegates[2], same_type), lambda: buy(delegates[2], same_type)])
assert sum(result.returncode == 0 for result in results) == 1, [result.stderr for result in results]
passed("one delegate buying twice: exactly one succeeds")

receipt = str(uuid.uuid4())
path = f"{winner}/{winning_order}/{receipt}.jpg"
sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES ('receipts','{path}'); SELECT public.submit_receipt('{winning_order}','{path}');", winner)
results = pair([
    lambda: sql(f"SELECT public.confirm_order('{winning_order}');", admin),
    lambda: sql(f"SELECT public.confirm_order('{winning_order}');", admin),
])
decisions = sorted(json.loads(result.stdout.strip())["result"] for result in results)
assert decisions == ["already_handled", "confirmed"], decisions
passed("two admin sessions confirming: one confirms, one already handled")

token = sql(f"SELECT qr_token FROM public.tickets WHERE delegate_id='{winner}' AND status='issued';", admin).stdout.strip()
results = pair([
    lambda: sql(f"SELECT public.check_in_ticket('{token}');", admin),
    lambda: sql(f"SELECT public.check_in_ticket('{token}');", admin),
])
decisions = sorted(json.loads(result.stdout.strip())["result"] for result in results)
assert decisions == ["already_used", "valid"], decisions
passed("same QR scanned in parallel: one valid, one already used")

started = time.monotonic()
with ThreadPoolExecutor(max_workers=10) as pool:
    results = list(pool.map(lambda user: buy(user, load_type), delegates[3:]))
assert len(results) == 50 and all(result.returncode == 0 for result in results), [result.stderr for result in results if result.returncode]
count = sql(f"SELECT count(*) FROM public.tickets WHERE ticket_type_id='{load_type}' AND status='reserved';", admin).stdout.strip()
assert count == "50", count
passed(f"50 delegate ticket orders in parallel: all succeed, capacity respected ({time.monotonic()-started:.2f}s)")
print("Concurrency and database load tests passed. Fixtures stay only in the disposable test database.")
