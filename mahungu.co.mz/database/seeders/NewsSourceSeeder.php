<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use App\Models\NewsSource;

class NewsSourceSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $sources = [
            [
                'name' => 'VOA Português',
                'url' => 'https://www.voaportugues.com/feed',
                'category' => 'Notícias',
                'active' => true,
            ],
            [
                'name' => 'Agência Lusa',
                'url' => 'https://www.lusa.pt/feed',
                'category' => 'Notícias',
                'active' => true,
            ],
            [
                'name' => 'RFI Português',
                'url' => 'https://www.rfi.fr/pt/feed',
                'category' => 'Notícias',
                'active' => true,
            ],
            [
                'name' => 'BBC Português',
                'url' => 'https://www.bbc.com/portuguese/feed',
                'category' => 'Notícias',
                'active' => true,
            ],
            [
                'name' => 'TechCrunch',
                'url' => 'https://feeds.techcrunch.com/feed',
                'category' => 'Tecnologia',
                'active' => true,
            ],
        ];

        foreach ($sources as $source) {
            NewsSource::firstOrCreate(
                ['url' => $source['url']],
                $source
            );
        }
    }
}
