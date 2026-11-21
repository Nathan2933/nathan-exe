<?php
/**
 * NATHAN.EXE - Contact Form Handler for Hostinger
 * Receives JSON / Form POST and sends email to nathanjerald293@gmail.com
 */

header('Content-Type: application/json; charset=utf-8');

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Read payload (supports JSON or standard form-data)
$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    $data = $_POST;
}

// Honeypot check for bots
if (!empty($data['bot-field'])) {
    echo json_encode(['ok' => true]);
    exit;
}

// Sanitize & validate fields
$name    = isset($data['name'])    ? trim(strip_tags((string)$data['name'])) : '';
$email   = isset($data['email'])   ? trim(filter_var((string)$data['email'], FILTER_SANITIZE_EMAIL)) : '';
$message = isset($data['message']) ? trim(strip_tags((string)$data['message'])) : '';

if (empty($name) || empty($message) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid input']);
    exit;
}

if (strlen($name) > 100 || strlen($email) > 200 || strlen($message) > 5000) {
    http_response_code(400);
    echo json_encode(['error' => 'Input too long']);
    exit;
}

$to = 'nathanjerald293@gmail.com';
$cleanName = str_replace(["\r", "\n"], ' ', $name);
$subject = "Portfolio message from " . $cleanName;

$body = "Name: " . $name . "\n";
$body .= "Email: " . $email . "\n";
$body .= "Date: " . date('Y-m-d H:i:s T') . "\n";
$body .= "IP: " . (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown') . "\n\n";
$body .= "Message:\n" . $message . "\n";

// Headers: From server host, Reply-To set to the sender's email so replying goes to them
$serverHost = !empty($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : 'nathan-exe.com';
$fromAddress = 'noreply@' . preg_replace('/^www\./', '', $serverHost);

$headers = [];
$headers[] = 'From: ' . $cleanName . ' <' . $fromAddress . '>';
$headers[] = 'Reply-To: ' . $email;
$headers[] = 'X-Mailer: PHP/' . phpversion();
$headers[] = 'Content-Type: text/plain; charset=UTF-8';

$sent = @mail($to, $subject, $body, implode("\r\n", $headers));

if ($sent) {
    echo json_encode(['ok' => true]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to send message']);
}
