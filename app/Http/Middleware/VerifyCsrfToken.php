<?php

namespace App\Http\Middleware;

use Illuminate\Foundation\Http\Middleware\VerifyCsrfToken as Middleware;

class VerifyCsrfToken extends Middleware
{
    /**
     * URIs isentas de verificação CSRF.
     *
     * Os callbacks da Meta (eliminação de dados e desautorização) são chamados
     * pelos servidores da Meta com um `signed_request` assinado com o app secret
     * (verificamos a assinatura no controlador), por isso não trazem token CSRF.
     */
    protected $except = [
        'api/meta/data-deletion',
        'api/meta/deauthorize',
    ];
}
