Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$publicDir = Join-Path $root "public"
$outDir = Join-Path $root "play-store-assets"
$heroPath = Join-Path $publicDir "talent7-hero.png"

if (!(Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

function New-Brush($hex) {
  return New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex))
}

function New-PenSafe($hex, $width = 1) {
  return New-Object System.Drawing.Pen -ArgumentList ([System.Drawing.ColorTranslator]::FromHtml($hex)), $width
}

function New-FontSafe($size, $style = [System.Drawing.FontStyle]::Regular) {
  return New-Object System.Drawing.Font -ArgumentList "Arial", $size, $style, ([System.Drawing.GraphicsUnit]::Pixel)
}

function Set-Quality($g) {
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
}

function Draw-RoundedRect($g, $rect, $radius, $brush, $pen = $null) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  if ($brush) { $g.FillPath($brush, $path) }
  if ($pen) { $g.DrawPath($pen, $path) }
  $path.Dispose()
}

function Draw-CoverImage($g, $img, $rect) {
  $scale = [Math]::Max($rect.Width / $img.Width, $rect.Height / $img.Height)
  $srcW = $rect.Width / $scale
  $srcH = $rect.Height / $scale
  $srcX = ($img.Width - $srcW) / 2
  $srcY = ($img.Height - $srcH) / 2
  $dest = New-Object System.Drawing.Rectangle $rect.X, $rect.Y, $rect.Width, $rect.Height
  $g.DrawImage($img, $dest, [single]$srcX, [single]$srcY, [single]$srcW, [single]$srcH, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-Text($g, $text, $x, $y, $size, $color, $style = [System.Drawing.FontStyle]::Regular, $maxWidth = 0) {
  $font = New-FontSafe $size $style
  $brush = New-Brush $color
  if ($maxWidth -gt 0) {
    $rect = New-Object System.Drawing.RectangleF ([single]$x), ([single]$y), ([single]$maxWidth), 1000
    $format = New-Object System.Drawing.StringFormat
    $format.Trimming = [System.Drawing.StringTrimming]::Word
    $g.DrawString($text, $font, $brush, $rect, $format)
    $format.Dispose()
  } else {
    $g.DrawString($text, $font, $brush, [single]$x, [single]$y)
  }
  $font.Dispose()
  $brush.Dispose()
}

function Draw-Gradient($g, $rect, $left, $right) {
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.ColorTranslator]::FromHtml($left)), ([System.Drawing.ColorTranslator]::FromHtml($right)), 0
  $g.FillRectangle($brush, $rect)
  $brush.Dispose()
}

function Save-Png($bmp, $path) {
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

function Draw-StatCard($g, $x, $y, $w, $label, $value) {
  $rect = New-Object System.Drawing.Rectangle $x, $y, $w, 132
  Draw-RoundedRect $g $rect 18 (New-Brush "#ffffff") (New-PenSafe "#d9e5e3" 2)
  Draw-Text $g $label ($x + 28) ($y + 22) 26 "#66757a" ([System.Drawing.FontStyle]::Bold)
  Draw-Text $g $value ($x + 28) ($y + 60) 42 "#101417" ([System.Drawing.FontStyle]::Bold)
}

function Draw-PhoneHeader($g, $title, $subtitle = "") {
  Draw-Gradient $g (New-Object System.Drawing.Rectangle 0, 0, 1080, 380) "#0b1514" "#382522"
  Draw-Text $g "Talent7" 64 66 46 "#ffffff" ([System.Drawing.FontStyle]::Bold)
  Draw-Text $g "7" 205 66 46 "#fb6a5a" ([System.Drawing.FontStyle]::Bold)
  Draw-Text $g $title 64 145 60 "#ffffff" ([System.Drawing.FontStyle]::Bold) 900
  if ($subtitle -ne "") { Draw-Text $g $subtitle 66 292 28 "#d9e4e2" ([System.Drawing.FontStyle]::Regular) 890 }
}

function Draw-BottomTabs($g, $active) {
  $rect = New-Object System.Drawing.Rectangle 34, 1748, 1012, 116
  Draw-RoundedRect $g $rect 28 (New-Brush "#ffffff") (New-PenSafe "#d7e2df" 2)
  $tabs = @("Rooms", "Teams", "Help", "Profile")
  for ($i = 0; $i -lt $tabs.Length; $i++) {
    $x = 70 + ($i * 244)
    if ($tabs[$i] -eq $active) {
      Draw-RoundedRect $g (New-Object System.Drawing.Rectangle $x, 1773, 190, 64) 18 (New-Brush "#13958f")
      Draw-Text $g $tabs[$i] ($x + 42) 1787 26 "#ffffff" ([System.Drawing.FontStyle]::Bold)
    } else {
      Draw-Text $g $tabs[$i] ($x + 42) 1787 26 "#101417" ([System.Drawing.FontStyle]::Bold)
    }
  }
}

function Draw-Chip($g, $text, $x, $y, $color = "#13958f") {
  $font = New-FontSafe 24 ([System.Drawing.FontStyle]::Bold)
  $size = $g.MeasureString($text, $font)
  $rect = New-Object System.Drawing.Rectangle $x, $y, ([int]$size.Width + 42), 54
  Draw-RoundedRect $g $rect 16 (New-Brush $color)
  $brush = New-Brush "#ffffff"
  $g.DrawString($text, $font, $brush, [single]($x + 21), [single]($y + 13))
  $font.Dispose()
  $brush.Dispose()
}

function Draw-RoomCard($g, $x, $y, $title, $lane, $a, $b, $votes, $rating) {
  $rect = New-Object System.Drawing.Rectangle $x, $y, 940, 292
  Draw-RoundedRect $g $rect 26 (New-Brush "#ffffff") (New-PenSafe "#d9e5e3" 2)
  Draw-Chip $g $lane ($x + 34) ($y + 30)
  Draw-Text $g $title ($x + 34) ($y + 95) 40 "#101417" ([System.Drawing.FontStyle]::Bold)
  Draw-RoundedRect $g (New-Object System.Drawing.Rectangle ($x + 34), ($y + 160), 872, 62) 16 (New-Brush "#f3f8f7")
  Draw-Text $g $a ($x + 58) ($y + 177) 25 "#101417" ([System.Drawing.FontStyle]::Bold)
  Draw-Text $g "vs" ($x + 440) ($y + 177) 25 "#fb6155" ([System.Drawing.FontStyle]::Bold)
  Draw-Text $g $b ($x + 498) ($y + 177) 25 "#101417" ([System.Drawing.FontStyle]::Bold)
  Draw-Text $g "Votes $votes" ($x + 58) ($y + 236) 25 "#101417" ([System.Drawing.FontStyle]::Bold)
  Draw-Text $g "Rating $rating/7" ($x + 520) ($y + 236) 25 "#101417" ([System.Drawing.FontStyle]::Bold)
}

$hero = [System.Drawing.Image]::FromFile($heroPath)

# App icon
$icon = New-Object System.Drawing.Bitmap 512, 512
$g = [System.Drawing.Graphics]::FromImage($icon)
Set-Quality $g
Draw-Gradient $g (New-Object System.Drawing.Rectangle 0, 0, 512, 512) "#13958f" "#fb6155"
Draw-RoundedRect $g (New-Object System.Drawing.Rectangle 48, 48, 416, 416) 96 (New-Brush "#ffffff22")
Draw-Text $g "7" 188 120 250 "#073b35" ([System.Drawing.FontStyle]::Bold)
Draw-Text $g "Talent" 144 340 54 "#073b35" ([System.Drawing.FontStyle]::Bold)
$g.Dispose()
Save-Png $icon (Join-Path $outDir "talent7-app-icon-512.png")

# Feature graphic
$feature = New-Object System.Drawing.Bitmap 1024, 500
$g = [System.Drawing.Graphics]::FromImage($feature)
Set-Quality $g
Draw-CoverImage $g $hero (New-Object System.Drawing.Rectangle 0, 0, 1024, 500)
Draw-Gradient $g (New-Object System.Drawing.Rectangle 0, 0, 670, 500) "#06100fcc" "#06100f00"
Draw-Text $g "Talent7" 58 96 88 "#ffffff" ([System.Drawing.FontStyle]::Bold)
Draw-Text $g "Challenge. Rate. Prove it." 62 205 36 "#ffffff" ([System.Drawing.FontStyle]::Bold)
Draw-Text $g "Talent battles, sports rooms, public ratings, proof uploads, and live challenge action." 64 270 25 "#e5eeec" ([System.Drawing.FontStyle]::Regular) 610
Draw-RoundedRect $g (New-Object System.Drawing.Rectangle 62, 382, 230, 58) 18 (New-Brush "#ffffff")
Draw-Text $g "Join first wave" 90 398 25 "#101417" ([System.Drawing.FontStyle]::Bold)
$g.Dispose()
Save-Png $feature (Join-Path $outDir "talent7-feature-graphic-1024x500.png")

# Phone screenshot 1
$s1 = New-Object System.Drawing.Bitmap 1080, 1920
$g = [System.Drawing.Graphics]::FromImage($s1)
Set-Quality $g
$g.Clear([System.Drawing.ColorTranslator]::FromHtml("#f3f8f7"))
Draw-CoverImage $g $hero (New-Object System.Drawing.Rectangle 0, 0, 1080, 760)
Draw-Gradient $g (New-Object System.Drawing.Rectangle 0, 0, 1080, 760) "#06100fcc" "#06100f33"
Draw-Text $g "Talent7" 66 95 92 "#ffffff" ([System.Drawing.FontStyle]::Bold)
Draw-Text $g "Challenge. Rate. Prove it." 70 215 50 "#ffffff" ([System.Drawing.FontStyle]::Bold) 760
Draw-Text $g "Fair challenge rooms for talent and sports with public ratings and proof." 72 350 32 "#dce8e6" ([System.Drawing.FontStyle]::Regular) 820
Draw-StatCard $g 62 825 430 "Challenge rooms" "11"
Draw-StatCard $g 588 825 430 "Top rooms" "3"
Draw-StatCard $g 62 990 430 "Proof uploads" "3"
Draw-StatCard $g 588 990 430 "Talent profiles" "2"
Draw-RoomCard $g 70 1190 "Badminton doubles" "Sports challenge" "Rohan + Dev" "Open invite" "A 5 / B 3" "7.0"
Draw-BottomTabs $g "Rooms"
$g.Dispose()
Save-Png $s1 (Join-Path $outDir "phone-01-home.png")

# Phone screenshot 2
$s2 = New-Object System.Drawing.Bitmap 1080, 1920
$g = [System.Drawing.Graphics]::FromImage($s2)
Set-Quality $g
$g.Clear([System.Drawing.ColorTranslator]::FromHtml("#f3f8f7"))
Draw-PhoneHeader $g "Join live challenge rooms" "Join as challenger or audience, vote, rate out of 7, and upload proof."
Draw-RoomCard $g 70 420 "Badminton doubles" "Sports challenge" "Rohan + Dev" "Open invite" "A 5 / B 3" "7.0"
Draw-RoomCard $g 70 760 "Breakdance battle" "Talent battle" "Arya" "Mateo" "A 4 / B 4" "6.8"
Draw-RoomCard $g 70 1100 "Breakdance battle" "Talent battle" "Street Flow Crew" "Open invite" "A 8 / B 7" "7.0"
Draw-RoundedRect $g (New-Object System.Drawing.Rectangle 70, 1460, 940, 154) 24 (New-Brush "#fff7e8") (New-PenSafe "#f3bf48" 2)
Draw-Text $g "Room chat, reports, and locked results keep challenges fair." 106 1508 32 "#101417" ([System.Drawing.FontStyle]::Bold) 820
Draw-BottomTabs $g "Rooms"
$g.Dispose()
Save-Png $s2 (Join-Path $outDir "phone-02-challenge-rooms.png")

# Phone screenshot 3
$s3 = New-Object System.Drawing.Bitmap 1080, 1920
$g = [System.Drawing.Graphics]::FromImage($s3)
Set-Quality $g
$g.Clear([System.Drawing.ColorTranslator]::FromHtml("#f3f8f7"))
Draw-PhoneHeader $g "Profiles, teams, and matchups" "Find people, check challenge history, and build a team."
Draw-RoundedRect $g (New-Object System.Drawing.Rectangle 70, 425, 940, 340) 28 (New-Brush "#ffffff") (New-PenSafe "#d9e5e3" 2)
Draw-Chip $g "Breakdance" 105 465
Draw-Text $g "Arya Flow" 105 545 48 "#101417" ([System.Drawing.FontStyle]::Bold)
Draw-Text $g "Challenge history, achievements, and Ready Now status" 108 615 30 "#66757a" ([System.Drawing.FontStyle]::Regular)
Draw-Text $g "Ready now" 108 700 30 "#101417" ([System.Drawing.FontStyle]::Bold)
Draw-RoundedRect $g (New-Object System.Drawing.Rectangle 70, 820, 940, 340) 28 (New-Brush "#ffffff") (New-PenSafe "#d9e5e3" 2)
Draw-Chip $g "Matchmaking" 105 860
Draw-Text $g "Find an opponent today" 105 940 42 "#101417" ([System.Drawing.FontStyle]::Bold)
Draw-Text $g "Search by activity and region, then invite a Ready Now challenger." 108 1010 30 "#66757a" ([System.Drawing.FontStyle]::Regular) 800
Draw-RoundedRect $g (New-Object System.Drawing.Rectangle 105, 1080, 810, 62) 16 (New-Brush "#13958f")
Draw-Text $g "Open challenges" 395 1097 25 "#ffffff" ([System.Drawing.FontStyle]::Bold)
Draw-RoundedRect $g (New-Object System.Drawing.Rectangle 70, 1220, 940, 300) 28 (New-Brush "#ffffff") (New-PenSafe "#d9e5e3" 2)
Draw-Chip $g "Teams" 105 1260
Draw-Text $g "Form squads, crews, and clans" 105 1340 42 "#101417" ([System.Drawing.FontStyle]::Bold)
Draw-Text $g "Create reusable team identities for doubles, dance, calisthenics, and gaming." 108 1410 29 "#66757a" ([System.Drawing.FontStyle]::Regular) 800
Draw-BottomTabs $g "Teams"
$g.Dispose()
Save-Png $s3 (Join-Path $outDir "phone-03-profiles-teams.png")

# Phone screenshot 4
$s4 = New-Object System.Drawing.Bitmap 1080, 1920
$g = [System.Drawing.Graphics]::FromImage($s4)
Set-Quality $g
$g.Clear([System.Drawing.ColorTranslator]::FromHtml("#f3f8f7"))
Draw-PhoneHeader $g "Safety and notifications" "Report unsafe content and keep important challenge updates together."
Draw-RoundedRect $g (New-Object System.Drawing.Rectangle 70, 420, 940, 330) 28 (New-Brush "#fff7e8") (New-PenSafe "#f3bf48" 2)
Draw-Text $g "Community safety" 110 460 40 "#101417" ([System.Drawing.FontStyle]::Bold)
Draw-Text $g "No fake proof. No harassment. Use your own content. Report problems quickly." 112 535 30 "#66757a" ([System.Drawing.FontStyle]::Regular) 800
Draw-RoundedRect $g (New-Object System.Drawing.Rectangle 112, 645, 300, 64) 18 (New-Brush "#111517")
Draw-Text $g "Report issue" 178 662 27 "#ffffff" ([System.Drawing.FontStyle]::Bold)
Draw-RoundedRect $g (New-Object System.Drawing.Rectangle 70, 820, 940, 370) 28 (New-Brush "#ffffff") (New-PenSafe "#d9e5e3" 2)
Draw-Chip $g "Notifications" 105 860
Draw-Text $g "Challenge updates in one place" 105 940 42 "#101417" ([System.Drawing.FontStyle]::Bold)
Draw-Text $g "See invites, live rooms, voting windows, proof, results, and weekly summaries." 108 1012 29 "#66757a" ([System.Drawing.FontStyle]::Regular) 800
Draw-RoundedRect $g (New-Object System.Drawing.Rectangle 70, 1260, 940, 300) 28 (New-Brush "#ffffff") (New-PenSafe "#d9e5e3" 2)
Draw-Text $g "Saved challenge rooms" 105 1305 42 "#101417" ([System.Drawing.FontStyle]::Bold)
Draw-Text $g "Save active or completed rooms and return when important activity happens." 108 1375 31 "#66757a" ([System.Drawing.FontStyle]::Regular) 800
Draw-BottomTabs $g "Safety"
$g.Dispose()
Save-Png $s4 (Join-Path $outDir "phone-04-safety-notifications.png")

$hero.Dispose()

Get-ChildItem $outDir -Filter *.png | Select-Object Name, Length
