from pathlib import Path
for name in ['index.html','products.html','product-list.html','product-detail.html','service-rent.html','insitools_edit.html','about.html']:
    p=Path(name)
    lines=p.read_text(encoding='utf-8').splitlines()
    print('---', name, '---')
    for i,line in enumerate(lines[-70:], start=len(lines)-69):
        print(f'{i:04d}: {line}')
