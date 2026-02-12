<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);
date_default_timezone_set('America/Guayaquil');

require_once("db_conf.php");

function logger($msg) {
    $fecha = date("Y-m-d H:i:s");
    file_put_contents("debug_log.txt", "[$fecha] $msg" . PHP_EOL, FILE_APPEND);
}

// CHECKPOINT 1
if (!$conn) { logger("FATAL: No hay conexión a BD"); die(); }
logger("PASO 1: Conexión OK.");

$data = file_get_contents("php://input");
$json = json_decode($data, true);

if (!$json) { logger("ERROR: JSON inválido"); die(); }
logger("PASO 2: JSON recibido.");

$end_device_ids = $json['end_device_ids'] ?? null;
$device_id = $end_device_ids['device_id'] ?? 'unknown';

// CHECKPOINT 3
logger("PASO 3: Dispositivo identificado: $device_id");

// FILTRO
$allowed_devices = ["trakerd-ls", "lw004-pb"];
if (!in_array($device_id, $allowed_devices)) {
    logger("BLOQUEADO: $device_id no permitido.");
    die();
}

// EXTRACCIÓN DE DATOS
$application_id = $end_device_ids['application_ids']['application_id'] ?? '';
$received_at = date('Y-m-d H:i:s');
$uplink = $json['uplink_message'] ?? [];
$decoded = $uplink['decoded_payload'] ?? [];
$latitude = $decoded['latitude'] ?? 0.0;
$longitude = $decoded['longitude'] ?? 0.0;

// Si la latitud es mayor a 90 (imposible) o menor a -90, la forzamos a 0.
if ($latitude > 90 || $latitude < -90) {
    logger("ALERTA: Latitud inválida ($latitude) detectada. Corrigiendo a 0.0");
    $latitude = 0.0;
}
// Lo mismo para la longitud (Max 180)
if ($longitude > 180 || $longitude < -180) {
    $longitude = 0.0;
}
// ------------------------------------------------

// CHECKPOINT 4
logger("PASO 4: Datos extraídos. Lat: $latitude, Log: $longitude");

// PREPARACIÓN SQL
$sqlCommand = "INSERT INTO TrackerD_LS (device_id, application_id, received_at, latitude, longitude) VALUES (?, ?, ?, ?, ?)";

// CHECKPOINT 5
logger("PASO 5: Intentando preparar SQL...");

if ($stmt = mysqli_prepare($conn, $sqlCommand)) {
    
    logger("PASO 6: SQL Preparado. Vinculando parámetros...");
    
    $bind = mysqli_stmt_bind_param($stmt, 'sssdd', 
        $device_id, 
        $application_id, 
        $received_at, 
        $latitude, 
        $longitude
    );

    if(!$bind) {
        logger("ERROR BIND: " . mysqli_stmt_error($stmt));
    } else {
        logger("PASO 7: Parámetros vinculados. Ejecutando...");
        
        if (mysqli_stmt_execute($stmt)) {
            logger("EXITO FINAL: Datos guardados en BD.");
        } else {
            logger("ERROR EXECUTE: " . mysqli_stmt_error($stmt));
        }
    }
    mysqli_stmt_close($stmt);

} else {
    // Si falla aquí, suele ser porque la tabla no tiene las columnas correctas
    logger("ERROR PREPARE (Revisa tu tabla): " . mysqli_error($conn));
}

mysqli_close($conn);
?>
