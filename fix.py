import sys

with open('create_chunk15.py', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('r"""', "r'''")
content = content.replace('"""))', "'''))")

with open('create_chunk15.py', 'w', encoding='utf-8') as f:
    f.write(content)
