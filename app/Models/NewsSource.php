<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class NewsSource extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'news_sources';

    protected $fillable = [
        'name',
        'url',
        'category',
        'active',
        'last_checked',
        'metadata',
    ];

    protected $casts = [
        'active' => 'boolean',
        'metadata' => 'json',
        'last_checked' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function scopeActive($query)
    {
        return $query->where('active', true)->whereNull('deleted_at');
    }
}
