$files = @(
    "d:\ark_aigc_demo-main-main\src\components\AiChangeCard\index.tsx",
    "d:\ark_aigc_demo-main-main\src\components\AiChangeCard\CheckScene\index.tsx",
    "d:\ark_aigc_demo-main-main\src\components\AiAvatarCard\index.tsx",
    "d:\ark_aigc_demo-main-main\src\pages\MainPage\MainArea\Room\Conversation.tsx"
)
foreach ($f in $files) {
    $content = [System.IO.File]::ReadAllText($f)
    $writer = New-Object System.IO.StreamWriter($f, $false, [System.Text.Encoding]::UTF8)
    $writer.NewLine = "`n"
    $writer.Write($content -replace "`r`n", "`n")
    $writer.Close()
    Write-Host "Fixed LF: $f"
}
