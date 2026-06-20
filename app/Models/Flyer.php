<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Flyer extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'client_id',
        'title',
        'category',
        'date',
        'content',
        'template',
        'html',
        'image',
        'background_image',
        'status',
        'captions',
        'metadata',
        'state',
        'approved_from',
    ];

    protected $casts = [
        'captions' => 'json',
        'metadata' => 'json',
        'state' => 'json',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function scopeActive($query)
    {
        return $query->whereNull('deleted_at');
    }

    public function scopeByStatus($query, $status)
    {
        return $query->where('status', $status);
    }
}
