<?php
$root = dirname(__DIR__);
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Remove app prefix if deployed in subdirectory (optional)
$script_name = dirname($_SERVER['SCRIPT_NAME']);
if ($script_name !== '/' && strpos($uri, $script_name) === 0) {
    $uri = substr($uri, strlen($script_name));
    if (empty($uri)) $uri = '/';
}

// Remove trailing slashes except for root
if ($uri !== '/' && substr($uri, -1) === '/') {
    $uri = rtrim($uri, '/');
}

$path = realpath($root . $uri);
// Also try to resolve paths that don't exist yet
if (!$path && $uri !== '/') {
    $path = $root . $uri;
}

// Serve index.html for root or direct requests
if ($uri === '/' || $uri === '/index.php' || $uri === '/index.html') {
    header('Content-Type: text/html; charset=UTF-8');
    readfile($root . '/index.html');
    exit;
}

// Serve static files
if ($path && strpos($path, $root) === 0 && is_file($path)) {
    // Determine MIME type
    $ext = pathinfo($path, PATHINFO_EXTENSION);
    $mimes = [
        'html' => 'text/html',
        'css' => 'text/css',
        'js' => 'application/javascript',
        'json' => 'application/json',
        'xml' => 'application/xml',
        'pdf' => 'application/pdf',
        'zip' => 'application/zip',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'svg' => 'image/svg+xml',
        'webp' => 'image/webp',
        'ico' => 'image/x-icon',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2',
        'ttf' => 'font/ttf',
        'otf' => 'font/otf',
        'mp4' => 'video/mp4',
        'webm' => 'video/webm',
        'mp3' => 'audio/mpeg',
    ];
    
    $mime = $mimes[$ext] ?? 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Cache-Control: public, max-age=3600');
    readfile($path);
    exit;
}

// Try to serve index.html for SPA routing
$index_path = realpath($root . '/index.html');
if ($index_path && is_file($index_path)) {
    header('Content-Type: text/html; charset=UTF-8');
    readfile($index_path);
    exit;
}

http_response_code(404);
echo 'Arquivo não encontrado.';
