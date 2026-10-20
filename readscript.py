import os
for path in ['src/app/api/conversations/'+'[id]'+'/route.ts', 'src/app/api/conversations/'+'[id]'+'/messages/route.ts']:
    with open(path, 'r', encoding='utf-8') as f:
        print('=== '+path+' ===')
        print(f.read())
        print('=== END ===')
