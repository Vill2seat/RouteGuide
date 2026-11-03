package com.routeguide.mvp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.routeguide.mvp.ui.RoadGuideApp
import com.routeguide.mvp.ui.theme.RoadGuideTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            RoadGuideTheme {
                RoadGuideApp()
            }
        }
    }
}
