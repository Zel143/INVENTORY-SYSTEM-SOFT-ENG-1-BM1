Remove-Item "E:\INVENTORY-SYSTEM-SOFT-ENG-1-BM1\ls.ps1" -Force -ErrorAction SilentlyContinue
$items = Get-ChildItem "E:\INVENTORY-SYSTEM-SOFT-ENG-1-BM1" | Where-Object { $_.Name -like "tmpclaude-*" }
foreach ($item in $items) { Remove-Item $item.FullName -Force -Recurse }
Write-Host "Removed $($items.Count) tmpclaude files"
