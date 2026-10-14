<?php
/*
 * Приём заявок с сайта GIREX: создаёт лид в Битрикс24 и дублирует заявку на почту.
 * Настройки (адрес вебхука, почта) — в lead-config.php рядом с этим файлом,
 * образец — lead-config.example.php. Сам lead-config.php в Git и в архивы сайта не попадает.
 *
 * lead.php?check — проверка настройки без создания лида: версия PHP, конфиг, ответ Битрикс24.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function reply(int $code, array $data): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function cut(string $s, int $max): string
{
    return mb_substr(trim($s), 0, $max);
}

/* не больше $limit обращений с одного адреса за 10 минут */
function rateLimit(int $limit): void
{
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $isLocal = $ip === '' || $ip === '::1' || strpos($ip, '127.') === 0;
    if ($isLocal && !empty($_SERVER['HTTP_X_REAL_IP'])) {
        $ip = (string)$_SERVER['HTTP_X_REAL_IP'];
    }
    $file = sys_get_temp_dir() . '/girex-lead-' . md5($ip . __DIR__);
    $now = time();
    $hits = [];
    if (is_file($file)) {
        foreach (explode(',', (string)file_get_contents($file)) as $t) {
            if ((int)$t > $now - 600) {
                $hits[] = (int)$t;
            }
        }
    }
    if (count($hits) >= $limit) {
        reply(429, ['ok' => false, 'error' => 'rate']);
    }
    $hits[] = $now;
    @file_put_contents($file, implode(',', $hits), LOCK_EX);
}

function bitrix(string $webhook, string $method, array $params): array
{
    $url = $webhook . '/' . $method . '.json';
    $body = http_build_query($params);
    $code = 0;
    $err = '';
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 15,
        ]);
        $res = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
    } else {
        $ctx = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => $body,
            'timeout' => 15,
            'ignore_errors' => true,
        ]]);
        $res = @file_get_contents($url, false, $ctx);
        if ($res === false) {
            $err = 'нет соединения';
        }
        if (isset($http_response_header[0]) && preg_match('#\s(\d{3})\s#', $http_response_header[0], $m)) {
            $code = (int)$m[1];
        }
    }
    $data = is_string($res) ? json_decode($res, true) : null;
    if (!is_array($data)) {
        $data = [];
    }
    if ($err !== '' || $code >= 400 || isset($data['error'])) {
        $why = $data['error_description'] ?? $data['error'] ?? '';
        if ($why === '') {
            $why = $err !== '' ? $err : 'HTTP ' . $code;
        }
        error_log('lead.php: Битрикс24 ' . $method . ' — ' . $why);
        return ['ok' => false, 'why' => $why];
    }
    return ['ok' => true, 'result' => $data['result'] ?? null];
}

function mailCopy(array $cfg, string $subject, string $text, string $replyTo): bool
{
    $to = trim((string)($cfg['email'] ?? ''));
    if ($to === '') {
        return false;
    }
    $from = (string)($cfg['from'] ?? 'noreply@girex.ru');
    $headers = [
        'From: GIREX <' . $from . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
    ];
    if (filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
        $headers[] = 'Reply-To: ' . $replyTo;
    }
    $subj = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    return @mail($to, $subj, $text, implode("\r\n", $headers), '-f' . $from);
}

/* ——— настройки ——— */
$cfgFile = __DIR__ . '/lead-config.php';
$cfg = is_file($cfgFile) ? require $cfgFile : [];
if (!is_array($cfg)) {
    $cfg = [];
}
$webhook = rtrim(trim((string)($cfg['webhook'] ?? '')), '/');
if (!preg_match('#^https?://#', $webhook) || strpos($webhook, 'ВАШ-ПОРТАЛ') !== false) {
    $webhook = '';
}

/* ——— проверка настройки ——— */
if (isset($_GET['check'])) {
    rateLimit(10);
    $test = $webhook !== '' ? bitrix($webhook, 'crm.lead.fields', []) : ['ok' => false, 'why' => 'вебхук не задан'];
    reply(200, [
        'php' => PHP_VERSION,
        'curl' => function_exists('curl_init'),
        'mbstring' => function_exists('mb_substr'),
        'config' => is_file($cfgFile),
        'bitrix' => $test['ok'] ? 'ok' : $test['why'],
        'email' => (string)($cfg['email'] ?? '') !== '',
    ]);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    reply(405, ['ok' => false, 'error' => 'method']);
}

/* заявки принимаем только со страниц своего сайта */
$hosts = $cfg['hosts'] ?? ['girex.ru', 'www.girex.ru'];
$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? ''));
$originHost = strtolower((string)parse_url($origin, PHP_URL_HOST));
if (!in_array($originHost, $hosts, true)) {
    reply(403, ['ok' => false, 'error' => 'origin']);
}

$in = json_decode((string)file_get_contents('php://input', false, null, 0, 65536), true);
if (!is_array($in) || !is_array($in['fields'] ?? null)) {
    reply(400, ['ok' => false, 'error' => 'format']);
}

/* ловушки для ботов: заполнено скрытое поле или форма отправлена мгновенно — молча принимаем и выбрасываем */
if (trim((string)($in['hp'] ?? '')) !== '' || (isset($in['t']) && (int)$in['t'] < 1500)) {
    reply(200, ['ok' => true]);
}

rateLimit(8);

$fields = [];
foreach ($in['fields'] as $k => $v) {
    if (count($fields) >= 20) {
        break;
    }
    if (!is_string($k) || !is_scalar($v)) {
        continue;
    }
    $k = cut($k, 60);
    if ($k !== '') {
        $fields[$k] = cut((string)$v, 5000);
    }
}

$name = $fields['Имя'] ?? '';
$phone = $fields['Телефон'] ?? '';
$email = $fields['Почта'] ?? '';
$company = $fields['Компания'] ?? '';
$source = ($fields['Источник заявки'] ?? '') !== '' ? $fields['Источник заявки'] : 'сайт';
$page = $fields['Страница'] ?? '';

if (strlen((string)preg_replace('/\D+/', '', $phone)) < 6) {
    reply(422, ['ok' => false, 'error' => 'phone']);
}

$utm = [];
foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as $u) {
    $val = $in['utm'][$u] ?? '';
    if (is_string($val) && trim($val) !== '') {
        $utm[$u] = cut($val, 200);
    }
}
$ref = is_string($in['ref'] ?? null) ? cut($in['ref'], 500) : '';

/* текст заявки: все поля, кроме вынесенных в отдельные поля лида */
$lines = [];
foreach ($fields as $k => $v) {
    if ($v === '' || in_array($k, ['Имя', 'Телефон', 'Почта', 'Компания'], true)) {
        continue;
    }
    $lines[] = strpos($v, "\n") !== false ? $k . ":\n" . $v : $k . ': ' . $v;
}
if ($ref !== '') {
    $lines[] = 'Откуда пришёл: ' . $ref;
}
foreach ($utm as $u => $val) {
    $lines[] = $u . ': ' . $val;
}
$comments = implode("\n", $lines);

$title = cut('Заявка с сайта GIREX — ' . $source, 250);
$lead = [
    'TITLE' => $title,
    'NAME' => $name,
    'COMPANY_TITLE' => $company,
    'PHONE' => [['VALUE' => $phone, 'VALUE_TYPE' => 'WORK']],
    'SOURCE_ID' => 'WEB',
    'SOURCE_DESCRIPTION' => cut($source . ($page !== '' ? ' — ' . $page : ''), 250),
    'COMMENTS' => $comments,
    'OPENED' => 'Y',
];
if ($email !== '') {
    $lead['EMAIL'] = [['VALUE' => $email, 'VALUE_TYPE' => 'WORK']];
}
if (!empty($cfg['assigned_by_id'])) {
    $lead['ASSIGNED_BY_ID'] = (int)$cfg['assigned_by_id'];
}
foreach ($utm as $u => $val) {
    $lead[strtoupper($u)] = $val;
}

$bx = $webhook !== ''
    ? bitrix($webhook, 'crm.lead.add', ['fields' => $lead, 'params' => ['REGISTER_SONET_EVENT' => 'Y']])
    : ['ok' => false, 'why' => 'вебхук не задан'];

/* копия на почту: всегда или только если Битрикс24 не принял заявку */
$mailed = false;
if (!empty($cfg['email_always']) || !$bx['ok']) {
    $text = $title . "\n\n"
        . 'Имя: ' . $name . "\n"
        . 'Телефон: ' . $phone . "\n"
        . ($email !== '' ? 'Почта: ' . $email . "\n" : '')
        . ($company !== '' ? 'Компания: ' . $company . "\n" : '')
        . "\n" . $comments . "\n\n"
        . ($bx['ok'] ? 'Лид в Битрикс24 создан, № ' . $bx['result'] : 'В Битрикс24 заявка НЕ попала: ' . $bx['why']);
    $mailed = mailCopy($cfg, $title, $text, $email);
}

if (!$bx['ok'] && !$mailed) {
    reply(502, ['ok' => false, 'error' => 'deliver']);
}
reply(200, ['ok' => true]);
