<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SharedItem extends Model
{
    protected $fillable = ['kind', 'client_id', 'payload'];
}
