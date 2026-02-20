Get-ChildItem "E:\INVENTORY-SYSTEM-SOFT-ENG-1-BM1" |
    Where-Object { $_.Name -notmatch "^(node_modules|\.vscode|node)$" } |
    Select-Object Name |
    Sort-Object Name
