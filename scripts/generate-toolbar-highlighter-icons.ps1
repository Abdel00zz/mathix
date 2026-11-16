Add-Type -AssemblyName System.Drawing

$assetDirectory = Join-Path $PSScriptRoot '..\public\assets\canvas-reference-2d'

function New-RoundedRectanglePath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $diameter = $Radius * 2
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Canvas {
  $bitmap = [System.Drawing.Bitmap]::new(
    192,
    192,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $bitmap.SetResolution(192, 192)
  return $bitmap
}

function New-HighlighterBase {
  param([ValidateSet('chisel', 'round')] [string]$Style)

  $bitmap = New-Canvas
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $upperBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 170, 174, 171))
  $bandBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 93, 98, 95))
  $shoulderBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 105, 110, 107))
  $nibBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 180, 184, 181))

  if ($Style -eq 'chisel') {
    $upperPath = New-RoundedRectanglePath -X 70 -Y 45 -Width 52 -Height 62 -Radius 8
    $graphics.FillPath($upperBrush, $upperPath)
    $graphics.FillRectangle($bandBrush, 70, 98, 52, 12)
    $graphics.FillPolygon($shoulderBrush, [System.Drawing.Point[]]@(
      [System.Drawing.Point]::new(72, 108),
      [System.Drawing.Point]::new(120, 108),
      [System.Drawing.Point]::new(115, 122),
      [System.Drawing.Point]::new(105, 139),
      [System.Drawing.Point]::new(87, 139),
      [System.Drawing.Point]::new(77, 122)
    ))
    $graphics.FillPolygon($nibBrush, [System.Drawing.Point[]]@(
      [System.Drawing.Point]::new(87, 138),
      [System.Drawing.Point]::new(105, 138),
      [System.Drawing.Point]::new(103, 151),
      [System.Drawing.Point]::new(90, 156)
    ))
    $upperPath.Dispose()
  } else {
    $upperPath = New-RoundedRectanglePath -X 73 -Y 45 -Width 46 -Height 62 -Radius 9
    $graphics.FillPath($upperBrush, $upperPath)
    $graphics.FillRectangle($bandBrush, 73, 98, 46, 12)
    $graphics.FillPolygon($shoulderBrush, [System.Drawing.Point[]]@(
      [System.Drawing.Point]::new(75, 108),
      [System.Drawing.Point]::new(117, 108),
      [System.Drawing.Point]::new(112, 124),
      [System.Drawing.Point]::new(104, 139),
      [System.Drawing.Point]::new(88, 139),
      [System.Drawing.Point]::new(80, 124)
    ))
    $tipPath = New-RoundedRectanglePath -X 88 -Y 134 -Width 16 -Height 23 -Radius 7
    $graphics.FillPath($nibBrush, $tipPath)
    $tipPath.Dispose()
    $upperPath.Dispose()
  }

  $upperBrush.Dispose()
  $bandBrush.Dispose()
  $shoulderBrush.Dispose()
  $nibBrush.Dispose()
  $graphics.Dispose()
  return $bitmap
}

function New-HighlighterMask {
  param([ValidateSet('chisel', 'round')] [string]$Style)

  $bitmap = New-Canvas
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $maskBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)

  if ($Style -eq 'chisel') {
    $maskPath = New-RoundedRectanglePath -X 70 -Y 45 -Width 52 -Height 62 -Radius 8
  } else {
    $maskPath = New-RoundedRectanglePath -X 73 -Y 45 -Width 46 -Height 62 -Radius 9
  }

  $graphics.FillPath($maskBrush, $maskPath)
  $maskPath.Dispose()
  $maskBrush.Dispose()
  $graphics.Dispose()
  return $bitmap
}

foreach ($style in @('chisel', 'round')) {
  $base = New-HighlighterBase -Style $style
  $mask = New-HighlighterMask -Style $style

  foreach ($baseName in @(
    "highlight-$style-toolbar-base.png",
    "highlight-$style-toolbar-base-neutral.png"
  )) {
    $base.Save(
      (Join-Path $assetDirectory $baseName),
      [System.Drawing.Imaging.ImageFormat]::Png
    )
  }

  $mask.Save(
    (Join-Path $assetDirectory "highlight-$style-toolbar-mask.png"),
    [System.Drawing.Imaging.ImageFormat]::Png
  )

  $base.Dispose()
  $mask.Dispose()
}
